import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DataSourceLabel } from "../enums.js";
import {
  adapterForSourceLabel,
  buildSimulatedReadings,
  emptyEnergySummary,
  readingDoesNotAffectMarketplace,
  summarizeEnergyHistory,
} from "../iot.js";
import { energyHistoryQuerySchema, ingestEnergyReadingSchema, simulateEnergyReadingsSchema } from "../schemas/iot.js";
import { IotAdapterName } from "../types.js";

describe("emptyEnergySummary", () => {
  it("starts at actual zeros without inventing volume", () => {
    const summary = emptyEnergySummary();
    assert.equal(summary.sampleCount, 0);
    assert.equal(summary.totalKwh, 0);
    assert.equal(summary.bySourceLabel.ACTUAL.totalKwh, 0);
    assert.equal(summary.bySourceLabel.SIMULATED.totalKwh, 0);
    assert.equal(summary.firstRecordedAt, null);
  });
});

describe("summarizeEnergyHistory", () => {
  it("keeps simulated kWh separate from actual kWh", () => {
    const summary = summarizeEnergyHistory([
      { kwh: 1.5, sourceLabel: DataSourceLabel.ACTUAL, recordedAt: "2026-09-01T00:00:00.000Z" },
      { kwh: 2, sourceLabel: DataSourceLabel.SIMULATED, recordedAt: "2026-09-02T00:00:00.000Z" },
      { kwh: 0.25, sourceLabel: DataSourceLabel.ESTIMATED, recordedAt: "2026-09-03T00:00:00.000Z" },
    ]);
    assert.equal(summary.sampleCount, 3);
    assert.equal(summary.totalKwh, 3.75);
    assert.equal(summary.bySourceLabel.ACTUAL.totalKwh, 1.5);
    assert.equal(summary.bySourceLabel.SIMULATED.totalKwh, 2);
    assert.equal(summary.bySourceLabel.ESTIMATED.totalKwh, 0.25);
    assert.equal(summary.firstRecordedAt, "2026-09-01T00:00:00.000Z");
    assert.equal(summary.lastRecordedAt, "2026-09-03T00:00:00.000Z");
  });
});

describe("buildSimulatedReadings", () => {
  it("labels every sample SIMULATED and does not invent extra kWh", () => {
    const now = new Date("2026-09-26T12:00:00.000Z");
    const drafts = buildSimulatedReadings({
      kwh: 1.25,
      samples: 3,
      intervalMinutes: 60,
      deviceId: "meter-1",
      now,
    });
    assert.equal(drafts.length, 3);
    assert.equal(
      drafts.every((row) => row.sourceLabel === DataSourceLabel.SIMULATED && row.adapter === IotAdapterName.SIMULATED),
      true,
    );
    assert.equal(
      drafts.every((row) => row.kwh === 1.25),
      true,
    );
    assert.equal(drafts[0]!.recordedAt.toISOString(), "2026-09-26T10:00:00.000Z");
    assert.equal(drafts[2]!.recordedAt.toISOString(), "2026-09-26T12:00:00.000Z");
  });
});

describe("adapterForSourceLabel", () => {
  it("forces simulated samples onto the simulated adapter", () => {
    assert.equal(adapterForSourceLabel(DataSourceLabel.SIMULATED, IotAdapterName.HTTP), IotAdapterName.SIMULATED);
    assert.equal(adapterForSourceLabel(DataSourceLabel.ACTUAL), IotAdapterName.HTTP);
  });
});

describe("iot schemas", () => {
  it("rejects unknown fields and negative kWh", () => {
    assert.equal(ingestEnergyReadingSchema.safeParse({ kwh: -1 }).success, false);
    assert.equal(ingestEnergyReadingSchema.safeParse({ kwh: 1, listingId: "x" }).success, false);
    assert.equal(simulateEnergyReadingsSchema.safeParse({ kwh: 1, sourceLabel: "ACTUAL" }).success, false);
    assert.equal(energyHistoryQuerySchema.safeParse({ until: "2020-01-01T00:00:00.000Z", from: "2021-01-01T00:00:00.000Z" }).success, false);
  });

  it("accepts a zero meter reading", () => {
    const parsed = ingestEnergyReadingSchema.parse({ kwh: 0, deviceId: "m-1" });
    assert.equal(parsed.kwh, 0);
    assert.equal(parsed.sourceLabel, DataSourceLabel.ACTUAL);
  });
});

describe("readingDoesNotAffectMarketplace", () => {
  it("is a documented no-op flag for telemetry", () => {
    assert.equal(
      readingDoesNotAffectMarketplace({ kwh: 99, sourceLabel: DataSourceLabel.SIMULATED }),
      true,
    );
  });
});
