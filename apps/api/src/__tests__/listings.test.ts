import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { Wallet } from "ethers";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
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
  return { email, password, userId: res.body.data!.user.id, token: res.body.data!.tokens.accessToken };
}

async function verifyWallet(token: string) {
  const wallet = Wallet.createRandom();
  const nonceRes = await api<{ message: string; nonce: string }>(server.baseUrl, "/wallets/nonce", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address }),
  });
  const { message, nonce } = nonceRes.body.data!;
  const signature = await wallet.signMessage(message);
  const verify = await api(server.baseUrl, "/wallets/verify", {
    method: "POST",
    token,
    body: JSON.stringify({ address: wallet.address, signature, nonce }),
  });
  assert.equal(verify.status, 200);
  return wallet.address;
}

function listingBody(overrides: Record<string, unknown> = {}) {
  return {
    energyType: "SOLAR",
    availableKwh: 100,
    minTradeKwh: 10,
    maxTradeKwh: 40,
    pricePerKwh: 0.125,
    location: "Austin TX",
    marketZone: "ERCOT-WEST",
    ...futureWindow(),
    ...overrides,
  };
}

describe("listing marketplace", { skip: !dbReady }, () => {
  it("rejects listing creation without a verified wallet", async () => {
    const seller = await register("SELLER");
    const res = await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody()),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "WALLET_REQUIRED");
  });

  it("rejects a buyer creating a listing", async () => {
    const buyer = await register("BUYER");
    await verifyWallet(buyer.token);
    const res = await api(server.baseUrl, "/listings", {
      method: "POST",
      token: buyer.token,
      body: JSON.stringify(listingBody()),
    });
    assert.equal(res.status, 403);
  });

  it("rejects unauthenticated listing creation", async () => {
    const res = await api(server.baseUrl, "/listings", {
      method: "POST",
      body: JSON.stringify(listingBody()),
    });
    assert.equal(res.status, 401);
  });

  it("creates a listing with balanced quantities and never fabricates sold kWh", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const res = await api<{ listing: { availableQuantityKwh: number; soldQuantityKwh: number; originalQuantityKwh: number } }>(
      server.baseUrl,
      "/listings",
      { method: "POST", token: seller.token, body: JSON.stringify(listingBody()) },
    );
    assert.equal(res.status, 201);
    const listing = res.body.data!.listing;
    assert.equal(listing.originalQuantityKwh, 100);
    assert.equal(listing.availableQuantityKwh, 100);
    assert.equal(listing.soldQuantityKwh, 0);
  });

  it("rejects maxTradeKwh greater than available kWh", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const res = await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ availableKwh: 20, maxTradeKwh: 30 })),
    });
    assert.equal(res.status, 422);
  });

  it("rejects unknown fields on create", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const res = await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ soldQuantityKwh: 99 })),
    });
    assert.equal(res.status, 422);
  });

  it("lists, filters, sorts and paginates public listings", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const marker = uniqueEmail("zone").split("@")[0]!;

    await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ marketZone: marker, energyType: "SOLAR", pricePerKwh: 0.11, availableKwh: 80 })),
    });
    await api(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ marketZone: marker, energyType: "WIND", pricePerKwh: 0.22, availableKwh: 50 })),
    });

    const filtered = await api<{ listings: Array<{ energyType: string; pricePerKwh: number }> }>(
      server.baseUrl,
      `/listings?marketZone=${marker}&energyType=SOLAR&sortBy=pricePerKwh&sortOrder=asc`,
    );
    assert.equal(filtered.status, 200);
    assert.equal(filtered.body.data!.listings.length, 1);
    assert.equal(filtered.body.data!.listings[0]!.energyType, "SOLAR");

    const page = await api<{ listings: unknown[]; page: number; pageSize: number; total: number; totalPages: number }>(
      server.baseUrl,
      `/listings?marketZone=${marker}&page=1&pageSize=1&sortBy=pricePerKwh&sortOrder=desc`,
    );
    assert.equal(page.status, 200);
    assert.equal(page.body.data!.listings.length, 1);
    assert.equal(page.body.data!.page, 1);
    assert.equal(page.body.data!.pageSize, 1);
    assert.equal(page.body.data!.total, 2);
    assert.equal(page.body.data!.totalPages, 2);
    assert.equal(page.body.meta?.total, 2);
  });

  it("lets the owner update remaining kWh without inventing sold volume", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const created = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ availableKwh: 100, maxTradeKwh: 40 })),
    });
    const id = created.body.data!.listing.id;

    const updated = await api<{
      listing: { availableQuantityKwh: number; soldQuantityKwh: number; originalQuantityKwh: number };
    }>(server.baseUrl, `/listings/${id}`, {
      method: "PATCH",
      token: seller.token,
      body: JSON.stringify({ availableKwh: 60, maxTradeKwh: 30 }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data!.listing.availableQuantityKwh, 60);
    assert.equal(updated.body.data!.listing.soldQuantityKwh, 0);
    assert.equal(updated.body.data!.listing.originalQuantityKwh, 60);
  });

  it("prevents another seller from editing a listing", async () => {
    const owner = await register("SELLER");
    const other = await register("SELLER");
    await verifyWallet(owner.token);
    await verifyWallet(other.token);
    const created = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: owner.token,
      body: JSON.stringify(listingBody()),
    });
    const denied = await api(server.baseUrl, `/listings/${created.body.data!.listing.id}`, {
      method: "PATCH",
      token: other.token,
      body: JSON.stringify({ location: "Hijacked" }),
    });
    assert.equal(denied.status, 403);
  });

  it("cancels an owned listing and hides it from public browse", async () => {
    const seller = await register("SELLER");
    await verifyWallet(seller.token);
    const zone = uniqueEmail("cancel").split("@")[0]!;
    const created = await api<{ listing: { id: string } }>(server.baseUrl, "/listings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify(listingBody({ marketZone: zone })),
    });
    const id = created.body.data!.listing.id;
    const cancelled = await api<{ listing: { status: string } }>(server.baseUrl, `/listings/${id}/cancel`, {
      method: "POST",
      token: seller.token,
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.data!.listing.status, "CANCELLED");

    const publicList = await api<{ listings: unknown[] }>(server.baseUrl, `/listings?marketZone=${zone}`);
    assert.equal(publicList.body.data!.listings.length, 0);

    const mine = await api<{ listings: Array<{ status: string }> }>(server.baseUrl, "/listings/mine", {
      token: seller.token,
    });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data!.listings.some((row) => row.status === "CANCELLED"), true);
  });

  it("returns 404 for an unknown listing id", async () => {
    const res = await api(server.baseUrl, "/listings/00000000-0000-4000-8000-000000000000");
    assert.equal(res.status, 404);
  });
});
