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
import {
  CREATE_LISTING_SELECTOR,
  priceToWeiPerMilliKwh,
  toMilliKwh,
  uuidToUint256,
} from "../lib/marketplace-events.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];
const CONTRACT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

const marketplaceInterface = new Interface([
  "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 quantityKwh, uint256 pricePerKwh)",
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

async function createSellerListing() {
  const seller = await register("SELLER");
  const sellerWallet = await verifyWallet(seller.token);
  const window = futureWindow();
  const listingRes = await api<{ listing: { id: string; availableQuantityKwh: number; pricePerKwh: number } }>(
    server.baseUrl,
    "/listings",
    {
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
    },
  );
  assert.equal(listingRes.status, 201);
  return { seller, sellerWallet, listing: listingRes.body.data!.listing };
}

function hash(n: number): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function encodeWord(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function encodeCreateListingInput(quantity: bigint, price: bigint, externalId: bigint): string {
  return `${CREATE_LISTING_SELECTOR}${encodeWord(quantity)}${encodeWord(price)}${encodeWord(externalId)}`;
}

function amounts() {
  const quantity = toMilliKwh(100);
  const price = priceToWeiPerMilliKwh(0.12);
  return { quantity, price };
}

function encodeCreatedLog(listingId: bigint, seller: string, quantity: bigint, price: bigint) {
  return marketplaceInterface.encodeEventLog(marketplaceInterface.getEvent("ListingCreated")!, [
    listingId,
    seller,
    quantity,
    price,
  ]);
}

function putCreateListing(
  txHash: string,
  from: string,
  listingUuid: string,
  options: {
    pending?: boolean;
    revert?: boolean;
    listingId?: bigint;
    quantity?: bigint;
    price?: bigint;
    externalId?: bigint;
    to?: string;
    logAddress?: string;
    omitLog?: boolean;
    input?: string;
  } = {},
) {
  const { quantity, price } = amounts();
  const qty = options.quantity ?? quantity;
  const px = options.price ?? price;
  const listingId = options.listingId ?? 7n;
  const externalId = options.externalId ?? uuidToUint256(listingUuid);
  const encoded = encodeCreatedLog(listingId, from, qty, px);
  const tx: RpcTransaction = {
    hash: txHash,
    from,
    to: options.to ?? CONTRACT,
    value: "0x0",
    input: options.input ?? encodeCreateListingInput(qty, px, externalId),
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
    logs:
      options.revert || options.omitLog
        ? []
        : [{ address: options.logAddress ?? CONTRACT, topics: encoded.topics as string[], data: encoded.data }],
    gasUsed: "0x5208",
  });
}

describe("on-chain listing id persistence", { skip: !dbReady }, () => {
  it("rejects unauthenticated confirmation", async () => {
    const res = await api(server.baseUrl, "/listings/11111111-1111-1111-1111-111111111111/on-chain", {
      method: "POST",
      body: JSON.stringify({ action: "confirm", txHash: hash(1), idempotencyKey: "unauth-key-1" }),
    });
    assert.equal(res.status, 401);
  });

  it("rejects a buyer confirming a listing they do not own", async () => {
    const { listing } = await createSellerListing();
    const buyer = await register("BUYER");
    await verifyWallet(buyer.token);
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({ action: "confirm", txHash: hash(2), idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(res.status, 403);
  });

  it("records wallet rejection without persisting an on-chain id", async () => {
    const { seller, listing } = await createSellerListing();
    const res = await api<{ listing: { onChainListingId?: string; onChainConfirmationStatus?: string; onChainTxHash?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "reject", idempotencyKey: `reject-${listing.id}` }),
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.listing.onChainConfirmationStatus, "REJECTED");
    assert.equal(res.body.data!.listing.onChainListingId, undefined);
    assert.equal(res.body.data!.listing.onChainTxHash, undefined);
  });

  it("keeps a missing receipt as PENDING and never CONFIRMED from the wallet hash alone", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(3);
    putCreateListing(txHash, sellerWallet.address, listing.id, { pending: true });
    const res = await api<{ listing: { onChainListingId?: string; onChainConfirmationStatus?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
      },
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.listing.onChainConfirmationStatus, "PENDING");
    assert.equal(res.body.data!.listing.onChainListingId, undefined);
  });

  it("persists a verified ListingCreated id only after receipt, contract, sender and call match", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(4);
    putCreateListing(txHash, sellerWallet.address, listing.id, { pending: true, listingId: 11n });
    const pending = await api<{ listing: { onChainConfirmationStatus?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
      },
    );
    assert.equal(pending.status, 200);
    assert.equal(pending.body.data!.listing.onChainConfirmationStatus, "PENDING");
    putCreateListing(txHash, sellerWallet.address, listing.id, { listingId: 11n });
    const confirmed = await api<{
      listing: {
        onChainListingId?: string;
        onChainConfirmationStatus?: string;
        onChainTxHash?: string;
        explorerUrl?: string;
        onChainContractAddress?: string;
        onChainNetwork?: string;
      };
    }>(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.data!.listing.onChainListingId, "11");
    assert.equal(confirmed.body.data!.listing.onChainConfirmationStatus, "CONFIRMED");
    assert.equal(confirmed.body.data!.listing.onChainTxHash, txHash);
    assert.equal(confirmed.body.data!.listing.explorerUrl?.includes(txHash), true);
    assert.equal(confirmed.body.data!.listing.onChainContractAddress, CONTRACT.toLowerCase());
    assert.equal(confirmed.body.data!.listing.onChainNetwork, env.CHAIN_NAME);

    const detail = await api<{ listing: { onChainListingId?: string } }>(server.baseUrl, `/listings/${listing.id}`);
    assert.equal(detail.body.data!.listing.onChainListingId, "11");
  });

  it("is idempotent for a confirmed listing id", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(5);
    putCreateListing(txHash, sellerWallet.address, listing.id, { listingId: 12n });
    const first = await api<{ listing: { id: string; onChainListingId?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
      },
    );
    const second = await api<{ listing: { id: string; onChainListingId?: string; onChainConfirmationStatus?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
      },
    );
    assert.equal(second.status, 200);
    assert.equal(second.body.data!.listing.id, first.body.data!.listing.id);
    assert.equal(second.body.data!.listing.onChainListingId, "12");
    assert.equal(second.body.data!.listing.onChainConfirmationStatus, "CONFIRMED");
  });

  it("rejects a duplicate on-chain listing id on another listing", async () => {
    const first = await createSellerListing();
    const second = await createSellerListing();
    const txHashA = hash(6);
    putCreateListing(txHashA, first.sellerWallet.address, first.listing.id, { listingId: 13n });
    const okRes = await api(server.baseUrl, `/listings/${first.listing.id}/on-chain`, {
      method: "POST",
      token: first.seller.token,
      body: JSON.stringify({ action: "confirm", txHash: txHashA, idempotencyKey: `confirm-${first.listing.id}` }),
    });
    assert.equal(okRes.status, 200);
    const txHashB = hash(7);
    putCreateListing(txHashB, second.sellerWallet.address, second.listing.id, { listingId: 13n });
    const dup = await api(server.baseUrl, `/listings/${second.listing.id}/on-chain`, {
      method: "POST",
      token: second.seller.token,
      body: JSON.stringify({ action: "confirm", txHash: txHashB, idempotencyKey: `confirm-${second.listing.id}` }),
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error?.code, "DUPLICATE_ONCHAIN_ID");
  });

  it("rejects a duplicate txHash on another listing", async () => {
    const first = await createSellerListing();
    const second = await createSellerListing();
    const txHash = hash(8);
    putCreateListing(txHash, first.sellerWallet.address, first.listing.id, { listingId: 14n });
    const okRes = await api(server.baseUrl, `/listings/${first.listing.id}/on-chain`, {
      method: "POST",
      token: first.seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${first.listing.id}` }),
    });
    assert.equal(okRes.status, 200);
    const dup = await api(server.baseUrl, `/listings/${second.listing.id}/on-chain`, {
      method: "POST",
      token: second.seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${second.listing.id}` }),
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error?.code, "DUPLICATE_TX");
  });

  it("rejects the wrong RPC chain", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(9);
    putCreateListing(txHash, sellerWallet.address, listing.id);
    rpc.chainId = 1;
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    rpc.chainId = env.CHAIN_ID;
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_NETWORK");
  });

  it("rejects a receipt from the wrong contract", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(10);
    putCreateListing(txHash, sellerWallet.address, listing.id, { to: OTHER, logAddress: OTHER });
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_CONTRACT");
  });

  it("rejects a successful receipt missing ListingCreated", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(11);
    putCreateListing(txHash, sellerWallet.address, listing.id, { omitLog: true });
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "INVALID_EVENT");
  });

  it("rejects a createListing call for another listing uuid", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const other = await createSellerListing();
    const txHash = hash(12);
    putCreateListing(txHash, sellerWallet.address, listing.id, { externalId: uuidToUint256(other.listing.id) });
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_LISTING");
  });

  it("marks a reverted receipt FAILED and does not persist an id", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(13);
    putCreateListing(txHash, sellerWallet.address, listing.id, { revert: true });
    const res = await api<{ listing?: { onChainListingId?: string; onChainConfirmationStatus?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}/on-chain`,
      {
        method: "POST",
        token: seller.token,
        body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
      },
    );
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "TX_REVERTED");
    const detail = await api<{ listing: { onChainListingId?: string; onChainConfirmationStatus?: string } }>(
      server.baseUrl,
      `/listings/${listing.id}`,
    );
    assert.equal(detail.body.data!.listing.onChainListingId, undefined);
    assert.equal(detail.body.data!.listing.onChainConfirmationStatus, "FAILED");
  });

  it("rejects a createListing from a wallet that is not the seller", async () => {
    const { seller, listing } = await createSellerListing();
    const stranger = Wallet.createRandom();
    const txHash = hash(14);
    putCreateListing(txHash, stranger.address, listing.id);
    const res = await api(server.baseUrl, `/listings/${listing.id}/on-chain`, {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WRONG_WALLET");
  });

  it("confirms concurrently without duplicating the on-chain id mapping", async () => {
    const { seller, sellerWallet, listing } = await createSellerListing();
    const txHash = hash(15);
    putCreateListing(txHash, sellerWallet.address, listing.id, { listingId: 21n });
    const body = JSON.stringify({ action: "confirm", txHash, idempotencyKey: `confirm-${listing.id}` });
    const [first, second] = await Promise.all([
      api<{ listing: { onChainListingId?: string } }>(server.baseUrl, `/listings/${listing.id}/on-chain`, {
        method: "POST",
        token: seller.token,
        body,
      }),
      api<{ listing: { onChainListingId?: string } }>(server.baseUrl, `/listings/${listing.id}/on-chain`, {
        method: "POST",
        token: seller.token,
        body,
      }),
    ]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(first.body.data!.listing.onChainListingId, "21");
    assert.equal(second.body.data!.listing.onChainListingId, "21");
    const rows = await prisma.listing.findMany({ where: { onChainListingId: "21" } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, listing.id);
  });
});
