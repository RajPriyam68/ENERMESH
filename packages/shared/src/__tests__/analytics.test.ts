import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DataSourceLabel, EnergyType } from "../enums.js";
import {
  carbonMetric,
  emptySumMetric,
  estimateCarbonSavingsKg,
  renewableShare,
  undefinedAverageMetric,
  volumeWeightedPrice,
} from "../analytics.js";
import { ESTIMATED_GRID_KG_CO2_PER_KWH } from "../constants.js";

describe("analytics helpers", () => {
  it("returns null average price when no energy was traded", () => {
    assert.equal(volumeWeightedPrice(0, 10), null);
    assert.equal(undefinedAverageMetric("/kWh", "No confirmed trades.").value, null);
  });

  it("computes volume-weighted price from real totals", () => {
    assert.equal(volumeWeightedPrice(100, 12.5), 0.125);
  });

  it("labels carbon savings as estimated, never actual", () => {
    const metric = carbonMetric(10);
    assert.equal(metric.sourceLabel, DataSourceLabel.ESTIMATED);
    assert.equal(metric.value, estimateCarbonSavingsKg(10));
    assert.equal(metric.value, 10 * ESTIMATED_GRID_KG_CO2_PER_KWH);
    assert.match(metric.note, /not measured/i);
  });

  it("keeps empty marketplace volume at actual zero", () => {
    const metric = emptySumMetric("kWh", "Confirmed trades only.");
    assert.equal(metric.value, 0);
    assert.equal(metric.sourceLabel, DataSourceLabel.ACTUAL);
  });

  it("treats all marketplace energy types as renewable", () => {
    assert.equal(renewableShare({ [EnergyType.SOLAR]: 40, [EnergyType.WIND]: 10 }), 1);
    assert.equal(renewableShare({}), null);
  });
});
