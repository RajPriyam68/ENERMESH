import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Wallet } from "ethers";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.trade.deleteMany({
      where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] },
    });
    await prisma.match.deleteMany({
      where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] },
    });
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
  const email = uniqueEmail(`s6-${role.toLowerCase()}`);
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(server.baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} S6`, role }),
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

describe("pricing recommendation", { skip: !dbReady }, () => {
  it("rejects unauthenticated price recommendations", async () => {
    const res = await api(server.baseUrl, "/pricing/recommendation");
    assert.equal(res.status, 401);
  });

  it("returns insufficient with null price when the book is empty", async () => {
    const seller = await register("SELLER");
    const res = await api<{
      recommendation: {
        recommendedPrice: number | null;
        confidence: number;
        dataQuality: string;
        advisory: boolean;
        sampleCounts: { trades: number; asks: number; bids: number };
      };
    }>(server.baseUrl, "/pricing/recommendation?energyType=WIND&marketZone=NYISO", { token: seller.token });
    assert.equal(res.status, 200);
    const rec = res.body.data!.recommendation;
    assert.equal(rec.recommendedPrice, null);
    assert.equal(rec.confidence, 0);
    assert.equal(rec.dataQuality, "INSUFFICIENT");
    assert.equal(rec.advisory, true);
    assert.equal(rec.sampleCounts.asks, 0);
    assert.equal(rec.sampleCounts.trades, 0);
  });

  it("recommends from a live listing without inventing extra volume", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const zone = `ZONE-${seller.userId.slice(0, 8)}`;
    const created = await api<{ listing: { pricePerKwh: number } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ marketZone: zone, pricePerKwh: 0.12 })),
    });
    assert.equal(created.status, 201);

    const res = await api<{
      recommendation: {
        recommendedPrice: number | null;
        sampleCounts: { trades: number; asks: number; bids: number };
        sourceLabel: string;
        advisory: boolean;
      };
    }>(server.baseUrl, `/pricing/recommendation?energyType=SOLAR&marketZone=${zone}`, { token: seller.token });
    assert.equal(res.status, 200);
    const rec = res.body.data!.recommendation;
    assert.equal(rec.advisory, true);
    assert.equal(rec.sourceLabel, "ACTUAL");
    assert.equal(rec.sampleCounts.asks >= 1, true);
    assert.equal(rec.recommendedPrice, 0.12);
  });
});

describe("analytics", { skip: !dbReady }, () => {
  it("rejects unauthenticated analytics", async () => {
    const res = await api(server.baseUrl, "/analytics");
    assert.equal(res.status, 401);
  });

  it("returns labelled zeros instead of fabricated volume", async () => {
    const seller = await register("SELLER");
    const res = await api<{
      analytics: {
        scope: string;
        energyTradedKwh: { value: number; sourceLabel: string };
        averagePricePerKwh: { value: number | null; dataQuality: string };
        estimatedCarbonSavingsKg: { value: number; sourceLabel: string };
        series: unknown[];
      };
    }>(server.baseUrl, "/analytics", { token: seller.token });
    assert.equal(res.status, 200);
    const analytics = res.body.data!.analytics;
    assert.equal(analytics.scope, "self");
    assert.equal(analytics.energyTradedKwh.value, 0);
    assert.equal(analytics.energyTradedKwh.sourceLabel, "ACTUAL");
    assert.equal(analytics.averagePricePerKwh.value, null);
    assert.equal(analytics.averagePricePerKwh.dataQuality, "INSUFFICIENT");
    assert.equal(analytics.estimatedCarbonSavingsKg.sourceLabel, "ESTIMATED");
    assert.equal(analytics.series.length, 0);
  });

  it("counts live remaining supply from the seller's own listing", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const created = await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ availableKwh: 40, maxTradeKwh: 40 })),
    });
    assert.equal(created.status, 201);
    const res = await api<{
      analytics: {
        supplyKwh: { value: number; sourceLabel: string };
        energyTradedKwh: { value: number };
      };
    }>(server.baseUrl, "/analytics", { token: seller.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.analytics.supplyKwh.value, 40);
    assert.equal(res.body.data!.analytics.supplyKwh.sourceLabel, "ACTUAL");
    assert.equal(res.body.data!.analytics.energyTradedKwh.value, 0);
  });

  it("does not leak another user's confirmed volume into a buyer dashboard", async () => {
    const seller = await register("SELLER");
    const stranger = await register("BUYER");
    await verifyWallet(seller.token);
    const listingRes = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody()),
    });
    assert.equal(listingRes.status, 201);
    const listingId = listingRes.body.data!.listing.id;
    const buyerUser = await prisma.user.findFirstOrThrow({ where: { id: stranger.userId } });
    const match = await prisma.match.create({
      data: {
        listingId,
        bidId: (
          await prisma.bid.create({
            data: {
              buyerId: stranger.userId,
              listingId,
              requestedKwh: 10,
              unmatchedKwh: 0,
              matchedKwh: 10,
              maxPricePerKwh: 0.12,
              energyType: "SOLAR",
              marketZone: "ERCOT-WEST",
              requiredFrom: new Date(Date.now() + 60 * 60 * 1000),
              requiredUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
              status: "MATCHED",
            },
          })
        ).id,
        sellerId: seller.userId,
        buyerId: stranger.userId,
        matchedKwh: 10,
        pricePerKwh: 0.12,
        status: "SETTLED",
      },
    });
    await prisma.trade.create({
      data: {
        matchId: match.id,
        buyerId: stranger.userId,
        sellerId: seller.userId,
        quantityKwh: 10,
        pricePerKwh: 0.12,
        totalAmount: 1.2,
        status: "CONFIRMED",
        blockchainTxStatus: "CONFIRMED",
        idempotencyKey: `s6-${buyerUser.id}-${match.id}`,
      },
    });

    const outsider = await register("BUYER");
    const res = await api<{
      analytics: { energyTradedKwh: { value: number }; revenue: { value: number }; spending: { value: number } };
    }>(server.baseUrl, "/analytics", { token: outsider.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.analytics.energyTradedKwh.value, 0);
    assert.equal(res.body.data!.analytics.revenue.value, 0);
    assert.equal(res.body.data!.analytics.spending.value, 0);

    const sellerDash = await api<{
      analytics: { energyTradedKwh: { value: number }; revenue: { value: number } };
    }>(server.baseUrl, "/analytics", { token: seller.token });
    assert.equal(sellerDash.status, 200);
    assert.equal(sellerDash.body.data!.analytics.energyTradedKwh.value, 10);
    assert.equal(sellerDash.body.data!.analytics.revenue.value, 1.2);
  });
});
