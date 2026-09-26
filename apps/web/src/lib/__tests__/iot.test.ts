import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sourceLabelTone, toEnergyHistoryParams } from "../iot";

describe("toEnergyHistoryParams", () => {
  it("omits empty filters", () => {
    assert.equal(toEnergyHistoryParams({}), "");
    assert.equal(toEnergyHistoryParams({ deviceId: "" }), "");
  });

  it("encodes source label and device", () => {
    const encoded = toEnergyHistoryParams({ sourceLabel: "SIMULATED", deviceId: "meter-1", pageSize: 50 });
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("sourceLabel"), "SIMULATED");
    assert.equal(params.get("deviceId"), "meter-1");
    assert.equal(params.get("pageSize"), "50");
  });
});

describe("sourceLabelTone", () => {
  it("distinguishes simulated from actual", () => {
    assert.equal(sourceLabelTone("SIMULATED"), "warning");
    assert.equal(sourceLabelTone("ACTUAL"), "success");
    assert.equal(sourceLabelTone("ESTIMATED"), "info");
  });
});
