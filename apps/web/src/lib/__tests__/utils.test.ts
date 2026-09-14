import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatKwh } from "../utils";

describe("formatKwh", () => {
  it("formats numeric energy", () => {
    assert.match(formatKwh(30), /30/);
    assert.match(formatKwh(30), /kWh/);
  });

  it("returns em dash for missing values", () => {
    assert.equal(formatKwh(null), "—");
    assert.equal(formatKwh(undefined), "—");
  });
});
