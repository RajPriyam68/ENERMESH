import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Wallet } from "ethers";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
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
  const password = "StrongPass123";
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(
    server.baseUrl,
    "/auth/register",
    {
      method: "POST",
      body: JSON.stringify({ email, password, displayName: `${role} Tester`, role }),
    },
  );
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
}

function listingBody(overrides: Record<string, unknown> = {}) {
  return {
    energyType: "SOLAR",
    availableKwh: 100,
    minTradeKwh: 10,
    maxTradeKwh: 100,
    pricePerKwh: 0.12,
    location: "Austin TX",
    marketZone: "ERCOT-WEST",
    ...futureWindow(),
    ...overrides,
  };
}

function bidBody(overrides: Record<string, unknown> = {}) {
  const window = futureWindow();
  return {
    requestedKwh: 30,
    maxPricePerKwh: 0.2,
    energyType: "SOLAR",
    marketZone: "ERCOT-WEST",
    requiredFrom: window.availableFrom,
    requiredUntil: window.availableUntil,
    ...overrides,
  };
}

async function publishListing(token: string, overrides: Record<string, unknown> = {}) {
  const res = await api<{ listing: { id: string; availableQuantityKwh: number; soldQuantityKwh: number } }>(
    server.baseUrl,
    "/listings",
    { method: "POST", token, body: JSON.stringify(listingBody(overrides)) },
  );
  assert.equal(res.status, 201);
  return res.body.data!.listing;
}

describe("bids and matching", { skip: !dbReady }, () => {
  it("rejects unauthenticated and seller bid creation", async () => {
    const unauth = await api(server.baseUrl, "/bids", { method: "POST", body: JSON.stringify(bidBody()) });
    assert.equal(unauth.status, 401);
    const seller = await register("SELLER");
    const denied = await api(server.baseUrl, "/bids", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(bidBody()),
    });
    assert.equal(denied.status, 403);
  });

  it("partially matches 100 kWh against a 30 kWh bid", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    await verifyWallet(seller.token);
    const listing = await publishListing(seller.token);
    const res = await api<{
      bid: { requestedKwh: number; unmatchedKwh: number; matchedKwh: number; status: string };
      matches: Array<{ matchedKwh: number; listingId: string }>;
    }>(server.baseUrl, "/bids", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify(bidBody({ listingId: listing.id, requestedKwh: 30 })),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.data!.bid.matchedKwh, 30);
    assert.equal(res.body.data!.bid.unmatchedKwh, 0);
    assert.equal(res.body.data!.bid.status, "MATCHED");
    assert.equal(res.body.data!.matches.length, 1);
    assert.equal(res.body.data!.matches[0]!.matchedKwh, 30);

    const updated = await api<{ listing: { availableQuantityKwh: number; soldQuantityKwh: number; originalQuantityKwh: number; status: string } }>(
      server.baseUrl,
      `/listings/${listing.id}`,
    );
    assert.equal(updated.body.data!.listing.availableQuantityKwh, 70);
    assert.equal(updated.body.data!.listing.soldQuantityKwh, 30);
    assert.equal(updated.body.data!.listing.originalQuantityKwh, 100);
    assert.equal(updated.body.data!.listing.status, "PARTIALLY_FILLED");
  });

  it("does not oversell when two buyers race the last 40 kWh", async () => {
    const seller = await register("SELLER");
    const buyerA = await register("BUYER");
    const buyerB = await register("BUYER");
    await verifyWallet(seller.token);
    const listing = await publishListing(seller.token, { availableKwh: 40, minTradeKwh: 1, maxTradeKwh: 40 });
    const [first, second] = await Promise.all([
      api<{ bid: { matchedKwh: number }; matches: unknown[] }>(server.baseUrl, "/bids", {
        method: "POST",
        token: buyerA.token,
        body: JSON.stringify(bidBody({ listingId: listing.id, requestedKwh: 40 })),
      }),
      api<{ bid: { matchedKwh: number }; matches: unknown[] }>(server.baseUrl, "/bids", {
        method: "POST",
        token: buyerB.token,
        body: JSON.stringify(bidBody({ listingId: listing.id, requestedKwh: 40 })),
      }),
    ]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    const matched = first.body.data!.bid.matchedKwh + second.body.data!.bid.matchedKwh;
    assert.equal(matched, 40);

    const updated = await api<{ listing: { availableQuantityKwh: number; soldQuantityKwh: number; originalQuantityKwh: number } }>(
      server.baseUrl,
      `/listings/${listing.id}`,
    );
    const listingRow = updated.body.data!.listing;
    assert.equal(listingRow.availableQuantityKwh + listingRow.soldQuantityKwh, listingRow.originalQuantityKwh);
    assert.equal(listingRow.soldQuantityKwh, 40);
    assert.equal(listingRow.availableQuantityKwh, 0);
  });

  it("prefers the cheaper listing when filling an open-market bid", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    await verifyWallet(seller.token);
    const zone = uniqueEmail("zone").split("@")[0]!;
    const cheap = await publishListing(seller.token, { marketZone: zone, pricePerKwh: 0.1, availableKwh: 20, minTradeKwh: 1, maxTradeKwh: 20 });
    const expensive = await publishListing(seller.token, { marketZone: zone, pricePerKwh: 0.18, availableKwh: 80, minTradeKwh: 1, maxTradeKwh: 80 });
    const res = await api<{ matches: Array<{ listingId: string; matchedKwh: number; pricePerKwh: number }> }>(
      server.baseUrl,
      "/bids",
      {
        method: "POST",
        token: buyer.token,
        body: JSON.stringify(bidBody({ marketZone: zone, requestedKwh: 50, maxPricePerKwh: 0.2 })),
      },
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.data!.matches[0]!.listingId, cheap.id);
    assert.equal(res.body.data!.matches[0]!.matchedKwh, 20);
    assert.equal(res.body.data!.matches[1]!.listingId, expensive.id);
    assert.equal(res.body.data!.matches[1]!.matchedKwh, 30);
  });

  it("rejects self-trade, incompatible type, and expired windows", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const listing = await publishListing(seller.token);
    const asBuyerDenied = await api(server.baseUrl, "/bids", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(bidBody({ listingId: listing.id })),
    });
    assert.equal(asBuyerDenied.status, 403);

    const buyer = await register("BUYER");
    const wrongType = await api(server.baseUrl, "/bids", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify(bidBody({ listingId: listing.id, energyType: "WIND" })),
    });
    assert.equal(wrongType.status, 201);
    assert.equal((wrongType.body.data as { matches: unknown[] }).matches.length, 0);

    const past = await api(server.baseUrl, "/bids", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify(
        bidBody({
          requiredFrom: new Date(Date.now() - 48 * 3600_000).toISOString(),
          requiredUntil: new Date(Date.now() - 24 * 3600_000).toISOString(),
        }),
      ),
    });
    assert.equal(past.status, 422);
  });

  it("hides other buyers' bids and allows cancel of remaining demand", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    const other = await register("BUYER");
    await verifyWallet(seller.token);
    await publishListing(seller.token, { availableKwh: 10, minTradeKwh: 1, maxTradeKwh: 10 });
    const created = await api<{ bid: { id: string } }>(server.baseUrl, "/bids", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify(bidBody({ requestedKwh: 50, maxPricePerKwh: 0.05 })),
    });
    const id = created.body.data!.bid.id;
    const peek = await api(server.baseUrl, `/bids/${id}`, { token: other.token });
    assert.equal(peek.status, 403);
    const cancelled = await api<{ bid: { status: string } }>(server.baseUrl, `/bids/${id}/cancel`, {
      method: "POST",
      token: buyer.token,
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data!.bid.status, "CANCELLED");
  });
});
