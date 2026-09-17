import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toSearchParams } from "../listings";

describe("toSearchParams", () => {
  it("omits empty filters", () => {
    assert.equal(toSearchParams({}), "");
    assert.equal(toSearchParams({ q: "", marketZone: undefined }), "");
  });

  it("encodes browse filters used by the catalog", () => {
    const encoded = toSearchParams({
      page: 2,
      pageSize: 12,
      energyType: "SOLAR",
      sortBy: "pricePerKwh",
      sortOrder: "asc",
    });
    assert.equal(encoded.startsWith("?"), true);
    const params = new URLSearchParams(encoded.slice(1));
    assert.equal(params.get("page"), "2");
    assert.equal(params.get("energyType"), "SOLAR");
    assert.equal(params.get("sortBy"), "pricePerKwh");
  });
});
