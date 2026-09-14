import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EnergyType } from "../enums.js";
import {
  computePartialMatch,
  isCompatible,
  type MatchCandidateBid,
  type MatchCandidateListing,
} from "../matching.js";

const baseListing = (): MatchCandidateListing => ({
  id: "11111111-1111-1111-1111-111111111111",
  sellerId: "seller-1",
  energyType: EnergyType.SOLAR,
  availableQuantityKwh: 100,
  minTradeKwh: 10,
  maxTradeKwh: 100,
  pricePerKwh: 4.5,
  marketZone: "WEST",
  availableFrom: new Date("2026-09-13T00:00:00Z"),
  availableUntil: new Date("2026-09-20T00:00:00Z"),
  createdAt: new Date("2026-09-13T08:00:00Z"),
});

const baseBid = (): MatchCandidateBid => ({
  id: "22222222-2222-2222-2222-222222222222",
  buyerId: "buyer-1",
  unmatchedKwh: 30,
  maxPricePerKwh: 5,
  energyType: EnergyType.SOLAR,
  marketZone: "WEST",
  requiredFrom: new Date("2026-09-14T00:00:00Z"),
  requiredUntil: new Date("2026-09-16T00:00:00Z"),
  createdAt: new Date("2026-09-13T09:00:00Z"),
});

describe("deterministic matching", () => {
  it("partially matches 100 kWh offer against 30 kWh bid", () => {
    const result = computePartialMatch(baseListing(), baseBid());
    assert.ok(result);
    assert.equal(result.matchedKwh, 30);
    assert.equal(result.remainingListingKwh, 70);
    assert.equal(result.remainingBidKwh, 0);
    assert.equal(result.pricePerKwh, 4.5);
  });

  it("rejects price above buyer max", () => {
    const listing = { ...baseListing(), pricePerKwh: 6 };
    assert.equal(isCompatible(listing, baseBid()), false);
    assert.equal(computePartialMatch(listing, baseBid()), null);
  });

  it("rejects incompatible energy type or zone", () => {
    assert.equal(isCompatible(baseListing(), { ...baseBid(), energyType: EnergyType.WIND }), false);
    assert.equal(isCompatible(baseListing(), { ...baseBid(), marketZone: "EAST" }), false);
  });

  it("rejects non-overlapping availability", () => {
    const bid = {
      ...baseBid(),
      requiredFrom: new Date("2026-10-01T00:00:00Z"),
      requiredUntil: new Date("2026-10-02T00:00:00Z"),
    };
    assert.equal(isCompatible(baseListing(), bid), false);
  });

  it("never matches seller to self", () => {
    const bid = { ...baseBid(), buyerId: "seller-1" };
    assert.equal(computePartialMatch(baseListing(), bid), null);
  });
});
