import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PriceRecommendation } from "@enermesh/shared";
import { applyRecommendedPrice, toPriceSearchParams } from "../pricing";

describe("toPriceSearchParams", () => {
  it("omits empty filters", () => {
    assert.equal(toPriceSearchParams({}), "");
    assert.equal(toPriceSearchParams({ marketZone: "" }), "");
  });

  it("encodes energy type and zone", () => {
    const encoded = toPriceSearchParams({ energyType: "SOLAR", marketZone: "ERCOT-WEST" });
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("energyType"), "SOLAR");
    assert.equal(params.get("marketZone"), "ERCOT-WEST");
  });
});

describe("applyRecommendedPrice", () => {
  it("never invents a price when the API reports insufficient data", () => {
    const recommendation: PriceRecommendation = {
      recommendedPrice: null,
      range: { min: null, max: null },
      confidence: 0,
      reason: "No completed trades or live offers/bids match these filters.",
      dataQuality: "INSUFFICIENT",
      sourceLabel: "ACTUAL",
      sampleCounts: { trades: 0, asks: 0, bids: 0 },
      advisory: true,
      filters: {},
    };
    assert.equal(applyRecommendedPrice(recommendation), null);
  });
});
