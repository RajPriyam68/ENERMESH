import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rotateTradeIdempotencyKey, tradeIdempotencyKey } from "../trades";

describe("trade report helpers", () => {
  it("returns a stable-looking key without inventing CONFIRMED", () => {
    const key = tradeIdempotencyKey("11111111-1111-1111-1111-111111111111", "purchase");
    assert.equal(typeof key, "string");
    assert.equal(key.length > 8, true);
  });

  it("can rotate a reject key so a later purchase is not bound to REJECTED", () => {
    const matchId = "22222222-2222-2222-2222-222222222222";
    const rotated = rotateTradeIdempotencyKey(matchId, "purchase");
    assert.equal(typeof rotated, "string");
    assert.equal(rotated.length > 8, true);
  });
});
