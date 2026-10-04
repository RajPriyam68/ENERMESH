import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Interface } from "ethers";
import type { RpcReceipt } from "../lib/chain-rpc.js";
import {
  CREATE_LISTING_SELECTOR,
  ENERGY_PURCHASED_TOPIC,
  LISTING_CREATED_TOPIC,
  parseCreateListingInput,
  parseEnergyPurchasedLogs,
  parseListingCreatedLogs,
  parseTradeSettledLogs,
  priceToWeiPerMilliKwh,
  purchaseValueWei,
  toMilliKwh,
  TRADE_SETTLED_TOPIC,
} from "../lib/marketplace-events.js";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const BUYER = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SELLER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const marketplaceInterface = new Interface([
  "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 quantityKwh, uint256 pricePerKwh)",
  "event EnergyPurchased(uint256 indexed listingId, uint256 indexed tradeId, address indexed buyer, uint256 quantityKwh, uint256 totalPaid)",
  "event TradeSettled(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 quantityKwh)",
]);

describe("marketplace event parsing", () => {
  it("decodes ListingCreated only from the configured contract", () => {
    const encoded = marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("ListingCreated")!, [
      7n,
      SELLER,
      100_000n,
      120n,
    ]);
    assert.equal((encoded.topics[0] as string).toLowerCase(), LISTING_CREATED_TOPIC);
    const receipt: RpcReceipt = {
      status: "0x1",
      transactionHash: "0x3",
      blockNumber: "0x3",
      to: CONTRACT,
      logs: [
        { address: OTHER, topics: encoded.topics as string[], data: encoded.data },
        { address: CONTRACT, topics: encoded.topics as string[], data: encoded.data },
      ],
    };
    const events = parseListingCreatedLogs(receipt, CONTRACT);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.listingId, 7n);
    assert.equal(events[0]!.seller, SELLER);
    assert.equal(events[0]!.quantityKwh, 100_000n);
    assert.equal(events[0]!.pricePerKwh, 120n);
  });

  it("parses createListing calldata including externalId", () => {
    const quantity = 100_000n;
    const price = 120n;
    const externalId = 42n;
    const input = `${CREATE_LISTING_SELECTOR}${quantity.toString(16).padStart(64, "0")}${price.toString(16).padStart(64, "0")}${externalId.toString(16).padStart(64, "0")}`;
    const parsed = parseCreateListingInput(input);
    assert.ok(parsed);
    assert.equal(parsed.quantityKwh, quantity);
    assert.equal(parsed.pricePerKwh, price);
    assert.equal(parsed.externalId, externalId);
  });

  it("decodes EnergyPurchased only from the configured contract", () => {
    const quantity = toMilliKwh(30);
    const paid = purchaseValueWei(quantity, priceToWeiPerMilliKwh(0.12));
    const encoded = marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("EnergyPurchased")!, [
      1n,
      9n,
      BUYER,
      quantity,
      paid,
    ]);
    assert.equal((encoded.topics[0] as string).toLowerCase(), ENERGY_PURCHASED_TOPIC);
    const receipt: RpcReceipt = {
      status: "0x1",
      transactionHash: "0x1",
      blockNumber: "0x1",
      to: CONTRACT,
      logs: [
        { address: OTHER, topics: encoded.topics as string[], data: encoded.data },
        { address: CONTRACT, topics: encoded.topics as string[], data: encoded.data },
      ],
    };
    const events = parseEnergyPurchasedLogs(receipt, CONTRACT);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.buyer, BUYER);
    assert.equal(events[0]!.quantityKwh, quantity);
    assert.equal(events[0]!.totalPaid, paid);
    assert.equal(events[0]!.tradeId, 9n);
  });

  it("decodes TradeSettled quantity and wallets", () => {
    const encoded = marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("TradeSettled")!, [
      4n,
      SELLER,
      BUYER,
      30_000n,
    ]);
    assert.equal((encoded.topics[0] as string).toLowerCase(), TRADE_SETTLED_TOPIC);
    const receipt: RpcReceipt = {
      status: "0x1",
      transactionHash: "0x2",
      blockNumber: "0x2",
      to: CONTRACT,
      logs: [{ address: CONTRACT, topics: encoded.topics as string[], data: encoded.data }],
    };
    const events = parseTradeSettledLogs(receipt, CONTRACT);
    assert.equal(events.length, 1);
    assert.equal(events[0]!.seller, SELLER);
    assert.equal(events[0]!.buyer, BUYER);
    assert.equal(events[0]!.quantityKwh, 30_000n);
  });
});
