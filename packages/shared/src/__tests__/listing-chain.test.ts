import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reportOnChainListingSchema } from "../schemas/listing.js";

describe("reportOnChainListingSchema", () => {
  it("requires txHash for confirm", () => {
    const parsed = reportOnChainListingSchema.safeParse({
      action: "confirm",
      idempotencyKey: "confirm-key-1",
    });
    assert.equal(parsed.success, false);
  });

  it("accepts confirm with a txHash", () => {
    const parsed = reportOnChainListingSchema.safeParse({
      action: "confirm",
      txHash: `0x${"a".repeat(64)}`,
      idempotencyKey: "confirm-key-12",
    });
    assert.equal(parsed.success, true);
  });

  it("forbids txHash on reject", () => {
    const parsed = reportOnChainListingSchema.safeParse({
      action: "reject",
      txHash: `0x${"b".repeat(64)}`,
      idempotencyKey: "reject-key-12",
    });
    assert.equal(parsed.success, false);
  });
});
