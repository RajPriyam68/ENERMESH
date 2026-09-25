import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DataQuality, DataSourceLabel, EnergyType } from "../enums.js";
import { recommendPrice, type PriceObservation } from "../pricing.js";

const now = new Date("2026-09-24T12:00:00Z");

function obs(partial: Partial<PriceObservation> & Pick<PriceObservation, "pricePerKwh" | "quantityKwh" | "kind">): PriceObservation {
  return {
    energyType: EnergyType.SOLAR,
    marketZone: "ERCOT-WEST",
    occurredAt: now,
    ...partial,
  };
}

describe("recommendPrice", () => {
  it("returns insufficient when there are no observations", () => {
    const result = recommendPrice({ observations: [], now });
    assert.equal(result.recommendedPrice, null);
    assert.equal(result.range.min, null);
    assert.equal(result.confidence, 0);
    assert.equal(result.dataQuality, DataQuality.INSUFFICIENT);
    assert.equal(result.sourceLabel, DataSourceLabel.ACTUAL);
    assert.equal(result.advisory, true);
    assert.match(result.reason, /no price is suggested/i);
  });

  it("weights completed trades more than live asks and stays advisory", () => {
    const result = recommendPrice({
      now,
      energyType: EnergyType.SOLAR,
      marketZone: "ERCOT-WEST",
      observations: [
        obs({ kind: "trade", pricePerKwh: 0.12, quantityKwh: 100 }),
        obs({ kind: "trade", pricePerKwh: 0.1, quantityKwh: 100 }),
        obs({ kind: "ask", pricePerKwh: 0.4, quantityKwh: 10 }),
      ],
    });
    assert.equal(result.advisory, true);
    assert.ok(result.recommendedPrice !== null);
    assert.ok(result.recommendedPrice! < 0.2);
    assert.equal(result.sampleCounts.trades, 2);
    assert.equal(result.sampleCounts.asks, 1);
    assert.equal(result.sourceLabel, DataSourceLabel.ACTUAL);
    assert.match(result.reason, /you choose/i);
  });

  it("does not invent a price from empty filtered samples", () => {
    const result = recommendPrice({
      now,
      energyType: EnergyType.WIND,
      marketZone: "NYISO",
      observations: [],
    });
    assert.equal(result.recommendedPrice, null);
    assert.equal(result.dataQuality, DataQuality.INSUFFICIENT);
    assert.equal(result.filters.energyType, EnergyType.WIND);
  });
});
