import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Interface, Wallet } from "ethers";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";
import { env } from "../config/env.js";
import {
  setChainRpcForTests,
  setContractAddressForTests,
  type ChainRpc,
  type RpcReceipt,
  type RpcTransaction,
} from "../lib/chain-rpc.js";
import { priceToWeiPerMilliKwh, purchaseValueWei, toMilliKwh } from "../lib/marketplace-events.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];
const CONTRACT = "0x1111111111111111111111111111111111111111";

const marketplaceInterface = new Interface([
  "event EnergyPurchased(uint256 indexed listingId, uint256 indexed tradeId, address indexed buyer, uint256 quantityKwh, uint256 totalPaid)",
  "event TradeSettled(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 quantityKwh)",
]);

class MockRpc implements ChainRpc {
  chainId = env.CHAIN_ID;
  receipts = new Map<string, RpcReceipt | null>();
  txs = new Map<string, RpcTransaction | null>();

  async getChainId() {
    return this.chainId;
  }
  async getTransactionReceipt(txHash: string) {
    return this.receipts.get(txHash.toLowerCase()) ?? null;
  }
  async getTransaction(txHash: string) {
    return this.txs.get(txHash.toLowerCase()) ?? null;
  }
}

const rpc = new MockRpc();

before(() => {
  setContractAddressForTests(CONTRACT);
  setChainRpcForTests(rpc);
});

after(async () => {
  setChainRpcForTests(null);
  setContractAddressForTests(null);
  if (dbReady) {
    await prisma.trade.deleteMany({ where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] } });
    await prisma.match.deleteMany({ where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] } });
    await prisma.bid.deleteMany({ where: { buyerId: { in: createdUserIds } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: createdUserIds } } });
    await prisma.auditLog.updateMany({ where: { userId: { in: createdUserIds } }, data: { userId: null } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await server.close();
  await prisma.$disconnect();
});

const futureWindow = () => {
  const from = new Date(Date.now() + 60 * 60 * 1000);
  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return { availableFrom: from.toISOString(), availableUntil: until.toISOString() };
};

async function register(role: "BUYER" | "SELLER") {
  const email = uniqueEmail(role.toLowerCase());
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(server.baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} Tester`, role }),
  });
  assert.equal(res.status, 201);
  createdUserIds.push(res.body.data!.user.id);
  return { userId: res.body.data!.user.id, token: res.body.data!.tokens.accessToken };
}

async function verifyWallet(token: string) {
  const wallet = Wallet.createRandom();
  const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address }),
  });
  const signature = await wallet.signMessage(nonceRes.body.data!.message);
  const verify = await api(server.baseUrl, "/wallets/verify", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address, signature, nonce: nonceRes.body.data!.nonce }),
  });
  assert.equal(verify.status, 200);
  return wallet;
}

async function createMatchedTrade() {
  const seller = await register("SELLER");
  const buyer = await register("BUYER");
  const sellerWallet = await verifyWallet(seller.token);
  const buyerWallet = await verifyWallet(buyer.token);
  const window = futureWindow();
  const listingRes = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
    method: "POST",
    token: seller.token,
    body: JSON.stringify({
      energyType: "SOLAR",
      availableKwh: 100,
      minTradeKwh: 10,
      maxTradeKwh: 100,
      pricePerKwh: 0.12,
      location: "Austin TX",
      marketZone: "ERCOT-WEST",
      ...window,
    }),
  });
  assert.equal(listingRes.status, 201);
  const bidRes = await api<{ bid: { id: string }; matches: Array<{ id: string; matchedKwh: number; pricePerKwh: number }> }>(
    server.baseUrl,
    "/bids",
    {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({
        listingId: listingRes.body.data!.listing.id,
        requestedKwh: 30,
        maxPricePerKwh: 0.2,
        energyType: "SOLAR",
        marketZone: "ERCOT-WEST",
        requiredFrom: window.availableFrom,
        requiredUntil: window.availableUntil,
      }),
    },
  );
  assert.equal(bidRes.status, 201);
  const match = bidRes.body.data!.matches[0]!;
  return { seller, buyer, sellerWallet, buyerWallet, match, listingId: listingRes.body.data!.listing.id };
}

function hash(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function encodePurchaseLog(buyer: string, quantityKwh: bigint, totalPaid: bigint) {
  return marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("EnergyPurchased")!, [
    1n,
    1n,
    buyer,
    quantityKwh,
    totalPaid,
  ]);
}

function encodeSettleLog(seller: string, buyer: string, quantityKwh: bigint) {
  return marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("TradeSettled")!, [1n, seller, buyer, quantityKwh]);
}

function amounts() {
  const quantity = toMilliKwh(30);
  const price = priceToWeiPerMilliKwh(0.12);
  const value = purchaseValueWei(quantity, price);
  return { quantity, price, value };
}

function putPurchase(txHash: string, from: string, options: { pending?: boolean; revert?: boolean; log?: ReturnType<typeof encodePurchaseLog>; value?: bigint; to?: string } = {}) {
  const { quantity, value } = amounts();
  const encoded = options.log ?? encodePurchaseLog(from, quantity, options.value ?? value);
  const tx: RpcTransaction = {
    hash: txHash,
    from,
    to: options.to ?? CONTRACT,
    value: `0x${(options.value ?? value).toString(16)}`,
    input: "0x03b5baae",
    blockNumber: options.pending ? null : "0x10",
  };
  rpc.txs.set(txHash, tx);
  if (options.pending) {
    rpc.receipts.set(txHash, null);
    return;
  }
  rpc.receipts.set(txHash, {
    status: options.revert ? "0x0" : "0x1",
    transactionHash: txHash,
    blockNumber: "0x10",
    to: options.to ?? CONTRACT,
    from,
    logs: options.revert
      ? []
      : [{ address: CONTRACT, topics: encoded.topics as string[], data: encoded.data }],
    gasUsed: "0x5208",
  });
}

function putSettle(txHash: string, from: string, seller: string, buyer: string) {
  const { quantity } = amounts();
  const encoded = encodeSettleLog(seller, buyer, quantity);
  rpc.txs.set(txHash, {
    hash: txHash,
    from,
    to: CONTRACT,
    value: "0x0",
    input: "0x73422d93",
    blockNumber: "0x11",
  });
  rpc.receipts.set(txHash, {
    status: "0x1",
    transactionHash: txHash,
    blockNumber: "0x11",
    to: CONTRACT,
    from,
    logs: [{ address: CONTRACT, topics: encoded.topics as string[], data: encoded.data }],
    gasUsed: "0x5208",
  });
}

describe("trade receipt verification", { skip: !dbReady }, () => {
  it("rejects unauthenticated reports", async () => {
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      body: JSON.stringify({
        matchId: "11111111-1111-1111-1111-111111111111",
        action: "purchase",
        txHash: hash(1),
        idempotencyKey: "unauth-key-1",
      }),
    });
    assert.equal(res.status, 401);
  });

  it("records wallet rejection without confirming", async () => {
    const { buyer, match } = await createMatchedTrade();
    const res = await api<{ trade: { status: string; blockchainTxStatus: string; txHash?: string } }>(
      server.baseUrl,
      "/trades/report",
      {
        method: "POST",
        token: buyer.token,
        body: JSON.stringify({ matchId: match.id, action: "reject", idempotencyKey: `reject-${match.id}` }),
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.trade.status, "REJECTED");
    assert.equal(res.body.data!.trade.blockchainTxStatus, "REJECTED");
    assert.equal(res.body.data!.trade.txHash, undefined);
  });

  it("allows a purchase after the same idempotency key was used for a wallet reject", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const rejected = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "reject", idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(rejected.status, 200);
    const txHash = hash(15);
    putPurchase(txHash, buyerWallet.address);
    const res = await api<{ trade: { status: string; blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.trade.status, "CONFIRMED");
    assert.equal(res.body.data!.trade.blockchainTxStatus, "CONFIRMED");
  });

  it("keeps a missing receipt as PENDING and never CONFIRMED from the wallet hash alone", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(2);
    putPurchase(txHash, buyerWallet.address, { pending: true });
    const res = await api<{ trade: { status: string; blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.trade.status, "PENDING");
    assert.equal(res.body.data!.trade.blockchainTxStatus, "PENDING");
  });

  it("confirms a purchase only after receipt, contract, sender, quantity and payment match", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(3);
    putPurchase(txHash, buyerWallet.address, { pending: true });
    const pending = await api<{ trade: { blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data!.trade.blockchainTxStatus, "PENDING");
    putPurchase(txHash, buyerWallet.address);
    const confirmed = await api<{ trade: { status: string; blockchainTxStatus: string; explorerUrl?: string } }>(
      server.baseUrl,
      "/trades/report",
      {
        method: "POST",
        token: buyer.token,
        body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
      },
    );
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data!.trade.status, "CONFIRMED");
    assert.equal(confirmed.body.data!.trade.blockchainTxStatus, "CONFIRMED");
    assert.equal(confirmed.body.data!.trade.explorerUrl?.includes(txHash), true);
  });

  it("is idempotent for a confirmed purchase", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(4);
    putPurchase(txHash, buyerWallet.address);
    const first = await api<{ trade: { id: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    const second = await api<{ trade: { id: string; blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(second.status, 200);
    assert.equal(second.body.data!.trade.id, first.body.data!.trade.id);
    assert.equal(second.body.data!.trade.blockchainTxStatus, "CONFIRMED");
  });

  it("rejects a duplicate txHash on another match", async () => {
    const first = await createMatchedTrade();
    const second = await createMatchedTrade();
    const txHash = hash(5);
    putPurchase(txHash, first.buyerWallet.address);
    const okRes = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: first.buyer.token,
      body: JSON.stringify({ matchId: first.match.id, action: "purchase", txHash, idempotencyKey: `purchase-${first.match.id}` }),
    });
    assert.equal(okRes.status, 200);
    putPurchase(txHash, second.buyerWallet.address);
    const dup = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: second.buyer.token,
      body: JSON.stringify({ matchId: second.match.id, action: "purchase", txHash, idempotencyKey: `purchase-${second.match.id}` }),
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error?.code, "DUPLICATE_TX");
  });

  it("rejects a purchase from a wallet that is not the buyer", async () => {
    const { buyer, match } = await createMatchedTrade();
    const stranger = Wallet.createRandom();
    const txHash = hash(6);
    putPurchase(txHash, stranger.address);
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_WALLET");
  });

  it("rejects a seller reporting a purchase", async () => {
    const { seller, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(7);
    putPurchase(txHash, buyerWallet.address);
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `seller-${match.id}` }),
    });
    assert.equal(res.status, 403);
  });

  it("rejects the wrong RPC chain", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(8);
    putPurchase(txHash, buyerWallet.address);
    rpc.chainId = 1;
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    rpc.chainId = env.CHAIN_ID;
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_NETWORK");
  });

  it("rejects a successful receipt without EnergyPurchased", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(9);
    const { value } = amounts();
    rpc.txs.set(txHash, {
      hash: txHash,
      from: buyerWallet.address,
      to: CONTRACT,
      value: `0x${value.toString(16)}`,
      input: "0x03b5baae",
      blockNumber: "0x10",
    });
    rpc.receipts.set(txHash, {
      status: "0x1",
      transactionHash: txHash,
      blockNumber: "0x10",
      to: CONTRACT,
      from: buyerWallet.address,
      logs: [],
      gasUsed: "0x1",
    });
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "INVALID_EVENT");
  });

  it("marks a reverted receipt FAILED", async () => {
    const { buyer, buyerWallet, match } = await createMatchedTrade();
    const txHash = hash(10);
    putPurchase(txHash, buyerWallet.address, { revert: true });
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "TX_REVERTED");
  });

  it("rejects settlement of a cancelled listing", async () => {
    const { seller, buyer, buyerWallet, match, listingId } = await createMatchedTrade();
    const cancelled = await api(server.baseUrl, `/listings/${listingId}/cancel`, { method: "POST", token: seller.token });
    assert.equal(cancelled.status, 200);
    const txHash = hash(11);
    putPurchase(txHash, buyerWallet.address);
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "STALE_TRADE");
  });

  it("rejects purchase after the listing window expires", async () => {
    const { buyer, buyerWallet, match, listingId } = await createMatchedTrade();
    await prisma.listing.update({
      where: { id: listingId },
      data: { availableUntil: new Date(Date.now() - 60_000) },
    });
    const txHash = hash(14);
    putPurchase(txHash, buyerWallet.address);
    const res = await api(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "STALE_TRADE");
  });

  it("confirms settleTrade after a verified purchase", async () => {
    const { buyer, seller, buyerWallet, sellerWallet, match } = await createMatchedTrade();
    const purchaseHash = hash(12);
    putPurchase(purchaseHash, buyerWallet.address);
    const purchased = await api<{ trade: { blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ matchId: match.id, action: "purchase", txHash: purchaseHash, idempotencyKey: `purchase-${match.id}` }),
    });
    assert.equal(purchased.body.data!.trade.blockchainTxStatus, "CONFIRMED");
    const settleHash = hash(13);
    putSettle(settleHash, sellerWallet.address, sellerWallet.address, buyerWallet.address);
    const settled = await api<{ trade: { status: string; blockchainTxStatus: string } }>(server.baseUrl, "/trades/report", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ matchId: match.id, action: "settle", txHash: settleHash, idempotencyKey: `settle-${match.id}` }),
    });
    assert.equal(settled.status, 200);
    assert.equal(settled.body.data!.trade.status, "COMPLETED");
    assert.equal(settled.body.data!.trade.blockchainTxStatus, "CONFIRMED");
  });
});
