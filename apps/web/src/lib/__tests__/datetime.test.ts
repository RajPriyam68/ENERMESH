import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromDatetimeLocal, toDatetimeLocal } from "../datetime";

describe("datetime local helpers", () => {
  it("round-trips a valid instant", () => {
    const source = new Date("2026-09-17T12:30:00");
    const local = toDatetimeLocal(source);
    assert.match(local, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    assert.equal(fromDatetimeLocal(local).getTime(), source.getTime());
  });

  it("returns empty string for invalid input", () => {
    assert.equal(toDatetimeLocal("not-a-date"), "");
    assert.equal(toDatetimeLocal(undefined), "");
  });
});
