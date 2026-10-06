import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const { hashPassword } = await import("../lib/password.js");
const { signAccessToken } = await import("../lib/jwt.js");

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.energyHistory.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.trade.deleteMany({
      where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] },
    });
    await prisma.match.deleteMany({
      where: { OR: [{ buyerId: { in: createdUserIds } }, { sellerId: { in: createdUserIds } }] },
    });
    await prisma.bid.deleteMany({ where: { buyerId: { in: createdUserIds } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: createdUserIds } } });
    await prisma.auditLog.updateMany({ where: { userId: { in: createdUserIds } }, data: { userId: null } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await server.close();
  await prisma.$disconnect();
});

async function register(role: "BUYER" | "SELLER") {
  const email = uniqueEmail(`s9-${role.toLowerCase()}`);
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(server.baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} S9`, role }),
  });
  assert.equal(res.status, 201);
  createdUserIds.push(res.body.data!.user.id);
  return { userId: res.body.data!.user.id, token: res.body.data!.tokens.accessToken, email };
}

async function createAdmin() {
  const email = uniqueEmail("s9-admin");
  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword("StrongPass123"),
      displayName: "S9 Admin",
      role: "ADMIN",
    },
  });
  createdUserIds.push(admin.id);
  const token = signAccessToken({ userId: admin.id, email: admin.email, role: "ADMIN" });
  return { userId: admin.id, token, email };
}

describe("admin and reports", { skip: !dbReady }, () => {
  it("rejects unauthenticated admin and report routes", async () => {
    const users = await api(server.baseUrl, "/admin/users");
    assert.equal(users.status, 401);
    const logs = await api(server.baseUrl, "/admin/audit-logs");
    assert.equal(logs.status, 401);
    const marketplace = await api(server.baseUrl, "/reports/marketplace");
    assert.equal(marketplace.status, 401);
    const settlement = await api(server.baseUrl, "/reports/settlement");
    assert.equal(settlement.status, 401);
    const telemetry = await api(server.baseUrl, "/reports/telemetry");
    assert.equal(telemetry.status, 401);
  });

  it("rejects buyer and seller access with 403", async () => {
    const seller = await register("SELLER");
    const buyer = await register("BUYER");
    const sellerUsers = await api(server.baseUrl, "/admin/users", { token: seller.token });
    assert.equal(sellerUsers.status, 403);
    const buyerLogs = await api(server.baseUrl, "/admin/audit-logs", { token: buyer.token });
    assert.equal(buyerLogs.status, 403);
    const buyerReport = await api(server.baseUrl, "/reports/marketplace", { token: buyer.token });
    assert.equal(buyerReport.status, 403);
    const sellerTelemetry = await api(server.baseUrl, "/reports/telemetry", { token: seller.token });
    assert.equal(sellerTelemetry.status, 403);
  });

  it("returns labelled zeros instead of fabricated marketplace volume", async () => {
    const admin = await createAdmin();
    const marketplace = await api<{
      report: {
        kind: string;
        counts: { listings: number; bids: number; matches: number; confirmedTrades: number };
        analytics: { energyTradedKwh: { value: number; sourceLabel: string }; scope: string };
      };
    }>(server.baseUrl, "/reports/marketplace", { token: admin.token });
    assert.equal(marketplace.status, 200);
    const report = marketplace.body.data!.report;
    assert.equal(report.kind, "marketplace");
    assert.equal(report.analytics.scope, "platform");
    assert.equal(report.analytics.energyTradedKwh.sourceLabel, "ACTUAL");
    assert.equal(typeof report.counts.confirmedTrades, "number");
    assert.equal(report.counts.confirmedTrades >= 0, true);

    const settlement = await api<{
      report: {
        kind: string;
        tradeStatusCounts: { CONFIRMED: number; DRAFT: number };
        analytics: { energyTradedKwh: { value: number } };
      };
    }>(server.baseUrl, "/reports/settlement", { token: admin.token });
    assert.equal(settlement.status, 200);
    assert.equal(settlement.body.data!.report.kind, "settlement");
    assert.equal(typeof settlement.body.data!.report.tradeStatusCounts.CONFIRMED, "number");

    const telemetry = await api<{
      report: {
        kind: string;
        sampleCount: number;
        totalKwh: { value: number; sourceLabel: string };
        bySourceLabel: { SIMULATED: { totalKwh: number } };
      };
    }>(server.baseUrl, "/reports/telemetry", { token: admin.token });
    assert.equal(telemetry.status, 200);
    assert.equal(telemetry.body.data!.report.kind, "telemetry");
    assert.equal(telemetry.body.data!.report.totalKwh.sourceLabel, "ACTUAL");
    assert.equal(telemetry.body.data!.report.sampleCount >= 0, true);
  });

  it("lists audit logs from real rows after registration", async () => {
    const admin = await createAdmin();
    const seller = await register("SELLER");
    const logs = await api<{
      logs: Array<{ action: string; entityType: string; userId: string | null }>;
      total: number;
    }>(server.baseUrl, `/admin/audit-logs?userId=${seller.userId}`, { token: admin.token });
    assert.equal(logs.status, 200);
    assert.equal(logs.body.data!.total >= 1, true);
    assert.equal(
      logs.body.data!.logs.some((row) => row.action === "USER_REGISTERED" && row.entityType === "User"),
      true,
    );
  });

  it("lets an admin disable a seller and rejects self-deactivation", async () => {
    const admin = await createAdmin();
    const seller = await register("SELLER");
    const selfPatch = await api(server.baseUrl, `/admin/users/${admin.userId}`, {
      method: "PATCH",
      token: admin.token,
      body: JSON.stringify({ isActive: false }),
    });
    assert.equal(selfPatch.status, 409);
    assert.equal(selfPatch.body.error?.code, "SELF_UPDATE_FORBIDDEN");

    const rolePatch = await api(server.baseUrl, `/admin/users/${seller.userId}`, {
      method: "PATCH",
      token: admin.token,
      body: JSON.stringify({ isActive: false, role: "ADMIN" }),
    });
    assert.equal(rolePatch.status, 422);

    const disabled = await api<{ user: { id: string; isActive: boolean } }>(
      server.baseUrl,
      `/admin/users/${seller.userId}`,
      {
        method: "PATCH",
        token: admin.token,
        body: JSON.stringify({ isActive: false }),
      },
    );
    assert.equal(disabled.status, 200);
    assert.equal(disabled.body.data!.user.isActive, false);

    const denied = await api(server.baseUrl, "/auth/me", { token: seller.token });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, "ACCOUNT_DISABLED");

    const audit = await api<{ logs: Array<{ action: string; metadata: { operation?: string } | null }> }>(
      server.baseUrl,
      `/admin/audit-logs?action=ADMIN_ACTION&entityId=${seller.userId}`,
      { token: admin.token },
    );
    assert.equal(audit.status, 200);
    assert.equal(
      audit.body.data!.logs.some((row) => row.metadata?.operation === "set_active"),
      true,
    );
  });

  it("does not treat EnergyHistory as confirmed marketplace volume", async () => {
    const admin = await createAdmin();
    const seller = await register("SELLER");
    const before = await api<{
      report: { analytics: { energyTradedKwh: { value: number } }; counts: { confirmedTrades: number } };
    }>(server.baseUrl, "/reports/marketplace", { token: admin.token });
    assert.equal(before.status, 200);
    const tradedBefore = before.body.data!.report.analytics.energyTradedKwh.value;
    const confirmedBefore = before.body.data!.report.counts.confirmedTrades;

    const ingest = await api(server.baseUrl, "/iot/readings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ kwh: 4, deviceId: "s9-meter", energyType: "SOLAR" }),
    });
    assert.equal(ingest.status, 201);

    const telemetry = await api<{
      report: { sampleCount: number; totalKwh: { value: number }; bySourceLabel: { ESTIMATED: { totalKwh: number } } };
    }>(server.baseUrl, "/reports/telemetry", { token: admin.token });
    assert.equal(telemetry.status, 200);
    assert.equal(telemetry.body.data!.report.sampleCount >= 1, true);
    assert.equal(telemetry.body.data!.report.bySourceLabel.ESTIMATED.totalKwh >= 4, true);

    const marketplace = await api<{
      report: { analytics: { energyTradedKwh: { value: number } }; counts: { confirmedTrades: number } };
    }>(server.baseUrl, "/reports/marketplace", { token: admin.token });
    assert.equal(marketplace.status, 200);
    assert.equal(marketplace.body.data!.report.analytics.energyTradedKwh.value, tradedBefore);
    assert.equal(marketplace.body.data!.report.counts.confirmedTrades, confirmedBefore);
  });
});
