import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.energyHistory.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.listing.deleteMany({ where: { sellerId: { in: createdUserIds } } });
    await prisma.auditLog.updateMany({ where: { userId: { in: createdUserIds } }, data: { userId: null } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await server.close();
  await prisma.$disconnect();
});

async function register(role: "BUYER" | "SELLER") {
  const email = uniqueEmail(`s8-${role.toLowerCase()}`);
  const res = await api<{ user: { id: string }; tokens: { accessToken: string } }>(server.baseUrl, "/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password: "StrongPass123", displayName: `${role} S8`, role }),
  });
  assert.equal(res.status, 201);
  createdUserIds.push(res.body.data!.user.id);
  return { userId: res.body.data!.user.id, token: res.body.data!.tokens.accessToken };
}

describe("iot energy history", { skip: !dbReady }, () => {
  it("rejects unauthenticated status, history, ingest, and simulate", async () => {
    const status = await api(server.baseUrl, "/iot/status");
    assert.equal(status.status, 401);
    const history = await api(server.baseUrl, "/iot/history");
    assert.equal(history.status, 401);
    const ingest = await api(server.baseUrl, "/iot/readings", {
      method: "POST",
      body: JSON.stringify({ kwh: 1 }),
    });
    assert.equal(ingest.status, 401);
    const simulate = await api(server.baseUrl, "/iot/simulate", {
      method: "POST",
      body: JSON.stringify({ kwh: 1 }),
    });
    assert.equal(simulate.status, 401);
  });

  it("rejects invalid ingest bodies", async () => {
    const seller = await register("SELLER");
    const missing = await api(server.baseUrl, "/iot/readings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 422);
    const negative = await api(server.baseUrl, "/iot/readings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ kwh: -1 }),
    });
    assert.equal(negative.status, 422);
    const unknown = await api(server.baseUrl, "/iot/readings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ kwh: 1, listingId: "11111111-1111-4111-8111-111111111111" }),
    });
    assert.equal(unknown.status, 422);
  });

  it("reports adapters without MQTT and without marketplace writes", async () => {
    const seller = await register("SELLER");
    const statusRes = await api<{
      status: {
        httpIngest: boolean;
        simulated: boolean;
        mqttConfigured: boolean;
        mqttAvailable: boolean;
        writesMarketplace: boolean;
        advisoryOnly: boolean;
      };
    }>(server.baseUrl, "/iot/status", { token: seller.token });
    assert.equal(statusRes.status, 200);
    const status = statusRes.body.data!.status;
    assert.equal(status.httpIngest, true);
    assert.equal(status.simulated, true);
    assert.equal(status.mqttAvailable, false);
    assert.equal(status.writesMarketplace, false);
    assert.equal(status.advisoryOnly, true);
    const serialized = JSON.stringify(statusRes.body);
    assert.equal(/MQTT_PASSWORD|password/i.test(serialized), false);
  });

  it("returns labelled zeros when the owner has no EnergyHistory", async () => {
    const seller = await register("SELLER");
    const res = await api<{
      samples: unknown[];
      summary: { sampleCount: number; totalKwh: number; firstRecordedAt: string | null };
      total: number;
    }>(server.baseUrl, "/iot/history", { token: seller.token });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.samples.length, 0);
    assert.equal(res.body.data!.summary.sampleCount, 0);
    assert.equal(res.body.data!.summary.totalKwh, 0);
    assert.equal(res.body.data!.summary.firstRecordedAt, null);
    assert.equal(res.body.data!.total, 0);
  });

  it("ingests an ACTUAL reading without changing listing remaining kWh", async () => {
    const seller = await register("SELLER");
    const listingsBefore = await api<{ listings: unknown[]; total: number }>(server.baseUrl, "/listings/mine", {
      token: seller.token,
    });
    assert.equal(listingsBefore.status, 200);
    const listingCount = listingsBefore.body.data!.total;

    const ingest = await api<{
      sample: { kwh: number; sourceLabel: string; adapter: string; userId: string };
    }>(server.baseUrl, "/iot/readings", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ kwh: 2.5, deviceId: "meter-west-1", energyType: "SOLAR" }),
    });
    assert.equal(ingest.status, 201);
    const sample = ingest.body.data!.sample;
    assert.equal(sample.kwh, 2.5);
    assert.equal(sample.sourceLabel, "ACTUAL");
    assert.equal(sample.adapter, "http");
    assert.equal(sample.userId, seller.userId);

    const history = await api<{
      samples: Array<{ kwh: number; sourceLabel: string }>;
      summary: { totalKwh: number; bySourceLabel: { ACTUAL: { totalKwh: number }; SIMULATED: { totalKwh: number } } };
    }>(server.baseUrl, "/iot/history", { token: seller.token });
    assert.equal(history.status, 200);
    assert.equal(history.body.data!.summary.totalKwh, 2.5);
    assert.equal(history.body.data!.summary.bySourceLabel.ACTUAL.totalKwh, 2.5);
    assert.equal(history.body.data!.summary.bySourceLabel.SIMULATED.totalKwh, 0);

    const listingsAfter = await api<{ total: number }>(server.baseUrl, "/listings/mine", { token: seller.token });
    assert.equal(listingsAfter.body.data!.total, listingCount);

    const analytics = await api<{ analytics: { energyTradedKwh: { value: number }; supplyKwh: { value: number } } }>(
      server.baseUrl,
      "/analytics",
      { token: seller.token },
    );
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.data!.analytics.energyTradedKwh.value, 0);
  });

  it("labels simulated samples SIMULATED and does not leak them to another user", async () => {
    const seller = await register("SELLER");
    const stranger = await register("BUYER");
    const simulated = await api<{
      samples: Array<{ sourceLabel: string; adapter: string; kwh: number }>;
      summary: { sampleCount: number; totalKwh: number; bySourceLabel: { SIMULATED: { sampleCount: number } } };
    }>(server.baseUrl, "/iot/simulate", {
      method: "POST",
      token: seller.token,
      body: JSON.stringify({ kwh: 1.25, samples: 3, intervalMinutes: 15, deviceId: "sim-1" }),
    });
    assert.equal(simulated.status, 201);
    assert.equal(simulated.body.data!.samples.length, 3);
    assert.equal(
      simulated.body.data!.samples.every((row) => row.sourceLabel === "SIMULATED" && row.adapter === "simulated"),
      true,
    );
    assert.equal(simulated.body.data!.summary.sampleCount, 3);
    assert.equal(simulated.body.data!.summary.totalKwh, 3.75);
    assert.equal(simulated.body.data!.summary.bySourceLabel.SIMULATED.sampleCount, 3);

    const strangerHistory = await api<{ samples: unknown[]; summary: { sampleCount: number; totalKwh: number } }>(
      server.baseUrl,
      "/iot/history",
      { token: stranger.token },
    );
    assert.equal(strangerHistory.status, 200);
    assert.equal(strangerHistory.body.data!.samples.length, 0);
    assert.equal(strangerHistory.body.data!.summary.totalKwh, 0);

    const peek = await api(server.baseUrl, `/iot/history?userId=${seller.userId}`, { token: stranger.token });
    assert.equal(peek.status, 403);
  });
});
