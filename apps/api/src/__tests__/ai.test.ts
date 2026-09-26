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
  const email = uniqueEmail(`s7-${role.toLowerCase()}`);
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(server.baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} S7`, role }),
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
    availableKwh: 40,
    minTradeKwh: 10,
    maxTradeKwh: 40,
    pricePerKwh: 0.12,
    location: "Austin TX",
    marketZone: "ERCOT-WEST",
    ...futureWindow(),
    ...overrides,
  };
}

describe("ai advisory", { skip: !dbReady }, () => {
  it("rejects unauthenticated status and insights", async () => {
    const status = await api(server.baseUrl, "/ai/status");
    assert.equal(status.status, 401);
    const insights = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      body: JSON.stringify({ topic: "dashboard" }),
    });
    assert.equal(insights.status, 401);
  });

  it("rejects invalid insight bodies", async () => {
    const seller = await register("SELLER");
    const missingTopic = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ question: "hello" }),
    });
    assert.equal(missingTopic.status, 422);
    const listingWithoutId = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ topic: "listing" }),
    });
    assert.equal(listingWithoutId.status, 422);
    const unknownField = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ topic: "dashboard", executeTrade: true }),
    });
    assert.equal(unknownField.status, 422);
  });

  it("reports provider unavailable without leaking secrets and falls back to labelled S6 facts", async () => {
    const seller = await register("SELLER");
    const statusRes = await api<{
      status: {
        configured: boolean;
        available: boolean;
        provider: string | null;
        advisoryOnly: boolean;
        actionsEnabled: boolean;
      };
    }>(server.baseUrl, "/ai/status", { token: seller.token });
    assert.equal(statusRes.status, 200);
    const status = statusRes.body.data!.status;
    assert.equal(status.configured, false);
    assert.equal(status.available, false);
    assert.equal(status.provider, null);
    assert.equal(status.advisoryOnly, true);
    assert.equal(status.actionsEnabled, false);
    const serialized = JSON.stringify(statusRes.body);
    assert.equal(/api[_-]?key|sk-|USER_LLM/i.test(serialized), false);

    const insightRes = await api<{
      insight: {
        advisory: boolean;
        actionsEnabled: boolean;
        usedFallback: boolean;
        providerStatus: string;
        facts: { analytics: { energyTradedKwh: number; averagePricePerKwh: number | null }; recommendation: { recommendedPrice: number | null } };
        caveats: string[];
      };
      status: { configured: boolean };
    }>(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ topic: "dashboard" }),
    });
    assert.equal(insightRes.status, 200);
    const insight = insightRes.body.data!.insight;
    assert.equal(insight.advisory, true);
    assert.equal(insight.actionsEnabled, false);
    assert.equal(insight.usedFallback, true);
    assert.equal(insight.providerStatus, "unavailable");
    assert.equal(insight.facts.analytics.energyTradedKwh, 0);
    assert.equal(insight.facts.analytics.averagePricePerKwh, null);
    assert.equal(insight.facts.recommendation.recommendedPrice, null);
    assert.equal(insight.caveats.some((item) => /advisory only/i.test(item)), true);
    assert.equal(insightRes.body.data!.status.configured, false);
  });

  it("explains a live listing from remaining kWh without inventing sold volume", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const zone = `AI-${seller.userId.slice(0, 8)}`;
    const created = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ marketZone: zone, availableKwh: 40, maxTradeKwh: 40 })),
    });
    assert.equal(created.status, 201);
    const listingId = created.body.data!.listing.id;
    const res = await api<{
      insight: {
        usedFallback: boolean;
        facts: {
          listing: { availableQuantityKwh: number; soldQuantityKwh: number; marketZone: string } | null;
          analytics: { energyTradedKwh: number };
        };
      };
    }>(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ topic: "listing", listingId, energyType: "SOLAR", marketZone: zone }),
    });
    assert.equal(res.status, 200);
    const facts = res.body.data!.insight.facts;
    assert.equal(facts.listing?.availableQuantityKwh, 40);
    assert.equal(facts.listing?.soldQuantityKwh, 0);
    assert.equal(facts.listing?.marketZone, zone);
    assert.equal(facts.analytics.energyTradedKwh, 0);
    assert.equal(res.body.data!.insight.usedFallback, true);
  });

  it("does not let a stranger inspect another buyer's bid through the advisor", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    const stranger = await register("BUYER");
    await verifyWallet(seller.token);
    const listingRes = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody()),
    });
    assert.equal(listingRes.status, 201);
    const bidRes = await api<{ bid: { id: string } }>(server.baseUrl, "/bids", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify({
        listingId: listingRes.body.data!.listing.id,
        requestedKwh: 10,
        maxPricePerKwh: 0.2,
        energyType: "SOLAR",
        marketZone: "ERCOT-WEST",
        requiredFrom: futureWindow().availableFrom,
        requiredUntil: futureWindow().availableUntil,
      }),
    });
    assert.equal(bidRes.status, 201);
    const forbidden = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: stranger.token,
      body: JSON.stringify({ topic: "bid", bidId: bidRes.body.data!.bid.id }),
    });
    assert.equal(forbidden.status, 403);
  });

  it("returns 404 for an unknown listing rather than inventing one", async () => {
    const seller = await register("SELLER");
    const res = await api(server.baseUrl, "/ai/insights", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ topic: "listing", listingId: "00000000-0000-4000-8000-000000000000" }),
    });
    assert.equal(res.status, 404);
  });
});
