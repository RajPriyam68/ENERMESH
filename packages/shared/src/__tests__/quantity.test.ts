import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkQuantityIntegrity,
  quantitiesFromAvailable,
  resizeRemaining,
  roundKwh,
} from "../quantity.js";

describe("quantity integrity", () => {
  it("accepts a balanced triple", () => {
    assert.equal(
      checkQuantityIntegrity({
        originalQuantityKwh: 100,
        availableQuantityKwh: 70,
        soldQuantityKwh: 30,
      }).ok,
      true,
    );
  });

  it("rejects oversold original quantity", () => {
    const result = checkQuantityIntegrity({
      originalQuantityKwh: 100,
      availableQuantityKwh: 0,
      soldQuantityKwh: 101,
    });
    assert.equal(result.ok, false);
  });

  it("rejects available + sold that do not equal original", () => {
    const result = checkQuantityIntegrity({
      originalQuantityKwh: 100,
      availableQuantityKwh: 40,
      soldQuantityKwh: 40,
    });
    assert.equal(result.ok, false);
  });

  it("rejects negative remaining energy", () => {
    const result = checkQuantityIntegrity({
      originalQuantityKwh: 100,
      availableQuantityKwh: -1,
      soldQuantityKwh: 101,
    });
    assert.equal(result.ok, false);
  });

  it("initialises a listing with sold = 0", () => {
    assert.deepEqual(quantitiesFromAvailable(30.125), {
      originalQuantityKwh: 30.125,
      availableQuantityKwh: 30.125,
      soldQuantityKwh: 0,
    });
  });

  it("resizes remaining kWh without changing sold", () => {
    const next = resizeRemaining(
      { originalQuantityKwh: 100, availableQuantityKwh: 70, soldQuantityKwh: 30 },
      50,
    );
    assert.equal(next.soldQuantityKwh, 30);
    assert.equal(next.availableQuantityKwh, 50);
    assert.equal(next.originalQuantityKwh, 80);
    assert.equal(checkQuantityIntegrity(next).ok, true);
  });

  it("rounds to three decimal places", () => {
    assert.equal(roundKwh(1.2346), 1.235);
  });
});
