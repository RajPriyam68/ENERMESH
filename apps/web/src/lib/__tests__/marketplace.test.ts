import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENERGY_PURCHASED_TOPIC,
  LISTING_CREATED_TOPIC,
  MARKETPLACE_SELECTORS,
  encodeCreateListing,
  encodePurchaseEnergy,
  encodeSettleTrade,
  encodeUint256,
  formatWeiAmount,
  listingIdFromCreatedLog,
  parseOnChainListing,
  priceToWeiPerMilliKwh,
  purchaseValueWei,
  toMilliKwh,
  tradeIdFromPurchasedLog,
  uuidToUint256,
} from "../marketplace";
import { blockchainStatusFromPhase, describeWalletError, isUserRejected, receiptSucceeded } from "../ethereum";
import { explorerTxUrl, isConfiguredContractAddress } from "../chain";
import { neverConfirmedFromWallet } from "../tx-status";

describe("marketplace encoding", () => {
  it("encodes createListing with the S4 selector", () => {
    const call = encodeCreateListing(30_000n, 5n, 42n);
    assert.equal(call.valueWei, 0n);
    assert.equal(call.data.startsWith(MARKETPLACE_SELECTORS.createListing), true);
    assert.equal(call.data.slice(10), `${encodeUint256(30_000n)}${encodeUint256(5n)}${encodeUint256(42n)}`);
  });

  it("encodes purchaseEnergy with exact payment", () => {
    const quantity = toMilliKwh(30);
    const price = priceToWeiPerMilliKwh(0.12);
    const value = purchaseValueWei(quantity, price);
    const call = encodePurchaseEnergy(1n, quantity, value);
    assert.equal(quantity, 30_000n);
    assert.equal(call.valueWei, value);
    assert.equal(call.data.startsWith(MARKETPLACE_SELECTORS.purchaseEnergy), true);
  });

  it("encodes settleTrade without value", () => {
    const call = encodeSettleTrade(7n);
    assert.equal(call.valueWei, 0n);
    assert.equal(call.data, `${MARKETPLACE_SELECTORS.settleTrade}${encodeUint256(7n)}`);
  });

  it("parses listing return data and created/purchased log indexes", () => {
    const seller = "0x0000000000000000000000001111111111111111111111111111111111111111";
    const data = `0x${seller.slice(2)}${encodeUint256(100n)}${encodeUint256(2n)}${encodeUint256(42n)}${encodeUint256(1n)}`;
    const listing = parseOnChainListing(data);
    assert.ok(listing);
    assert.equal(listing.seller, "0x1111111111111111111111111111111111111111");
    assert.equal(listing.remainingKwh, 100n);
    assert.equal(listing.status, 1);

    assert.equal(
      listingIdFromCreatedLog({ topics: [LISTING_CREATED_TOPIC, `0x${encodeUint256(9n)}`] }),
      9n,
    );
    assert.equal(
      tradeIdFromPurchasedLog({
        topics: [ENERGY_PURCHASED_TOPIC, `0x${encodeUint256(1n)}`, `0x${encodeUint256(4n)}`],
      }),
      4n,
    );
  });

  it("converts listing UUIDs without throwing on invalid input", () => {
    assert.equal(uuidToUint256("not-a-uuid"), 0n);
    assert.equal(uuidToUint256("11111111-1111-1111-1111-111111111111") > 0n, true);
  });
});

describe("wallet confirmation policy", () => {
  it("never maps a mined wallet receipt to CONFIRMED", () => {
    assert.equal(blockchainStatusFromPhase("mined"), "PENDING");
    assert.equal(blockchainStatusFromPhase("pending"), "PENDING");
    assert.equal(blockchainStatusFromPhase("rejected"), "REJECTED");
    assert.equal(neverConfirmedFromWallet("mined"), false);
    assert.equal(neverConfirmedFromWallet("pending"), false);
  });

  it("distinguishes user rejection from RPC failure", () => {
    assert.equal(isUserRejected({ code: 4001 }), true);
    assert.equal(describeWalletError({ code: 4001 }), "Signature request was rejected in your wallet.");
    assert.equal(isUserRejected({ code: -32002 }), false);
  });

  it("treats only status 0x1 as a successful receipt", () => {
    assert.equal(receiptSucceeded({ status: "0x1", transactionHash: "0xabc", blockNumber: "0x1", logs: [] }), true);
    assert.equal(receiptSucceeded({ status: "0x0", transactionHash: "0xabc", blockNumber: "0x1", logs: [] }), false);
    assert.equal(receiptSucceeded(null), false);
  });
});

describe("chain helpers", () => {
  it("rejects empty contract addresses", () => {
    assert.equal(isConfiguredContractAddress(""), false);
    assert.equal(isConfiguredContractAddress("0x0000000000000000000000000000000000000000"), false);
    assert.equal(isConfiguredContractAddress("0x1111111111111111111111111111111111111111"), true);
  });

  it("builds explorer URLs from env-style bases", () => {
    assert.equal(
      explorerTxUrl("https://amoy.polygonscan.com/", "0xdead"),
      "https://amoy.polygonscan.com/tx/0xdead",
    );
  });

  it("formats wei without inventing marketplace confirmation", () => {
    assert.equal(formatWeiAmount(10n ** 18n, "POL"), "1 POL");
  });
});
