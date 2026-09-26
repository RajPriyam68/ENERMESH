import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AiInsight } from "@enermesh/shared";
import { buildAiInsightRequest, defaultAiTopic, insightShowsFallback } from "../ai";

describe("defaultAiTopic", () => {
  it("picks listing or bid when an id is present", () => {
    assert.equal(defaultAiTopic({ listingId: "11111111-1111-4111-8111-111111111111" }), "listing");
    assert.equal(defaultAiTopic({ bidId: "11111111-1111-4111-8111-111111111111" }), "bid");
    assert.equal(defaultAiTopic({}), "dashboard");
  });
});

describe("buildAiInsightRequest", () => {
  it("omits empty filters and never adds execute flags", () => {
    const body = buildAiInsightRequest(
      { energyType: "SOLAR", marketZone: " ERCOT ", listingId: "11111111-1111-4111-8111-111111111111" },
      "  explain this  ",
    );
    assert.equal(body.topic, "listing");
    assert.equal(body.question, "explain this");
    assert.equal(body.marketZone, "ERCOT");
    assert.equal(body.energyType, "SOLAR");
    assert.equal("executeTrade" in body, false);
  });
});

describe("insightShowsFallback", () => {
  it("treats unavailable providers as fallback copy", () => {
    const insight: AiInsight = {
      advisory: true,
      actionsEnabled: false,
      sourceLabel: "ESTIMATED",
      dataQuality: "INSUFFICIENT",
      providerStatus: "unavailable",
      provider: null,
      model: null,
      usedFallback: true,
      summary: "empty",
      bullets: [],
      caveats: [],
      facts: { recommendation: null, analytics: null, listing: null, bid: null },
      generatedAt: "2026-09-24T00:00:00.000Z",
    };
    assert.equal(insightShowsFallback(insight), true);
  });
});
