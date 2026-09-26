import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { envelopeEventId, queryKeysForSocketEvent, shouldApplyEvent } from "../realtime";

describe("realtime helpers", () => {
  it("maps marketplace events to REST query keys", () => {
    assert.deepEqual(queryKeysForSocketEvent("listing:created"), [["listings"], ["listing"], ["pricing"], ["analytics"]]);
    assert.deepEqual(queryKeysForSocketEvent("bid:matched"), [
      ["bids"],
      ["bid"],
      ["matches"],
      ["listings"],
      ["pricing"],
      ["analytics"],
    ]);
    assert.deepEqual(queryKeysForSocketEvent("trade:confirmed"), [["matches"], ["trades"], ["analytics"], ["pricing"]]);
    assert.deepEqual(queryKeysForSocketEvent("notification:new"), [["notifications"]]);
    assert.deepEqual(queryKeysForSocketEvent("energy:updated"), [["iot"]]);
    assert.deepEqual(queryKeysForSocketEvent("dashboard:updated"), [
      ["listings"],
      ["bids"],
      ["matches"],
      ["notifications"],
      ["wallets"],
      ["analytics"],
      ["pricing"],
      ["iot"],
    ]);
    assert.deepEqual(queryKeysForSocketEvent("unknown:event"), []);
  });

  it("drops duplicate event ids and keeps new ones", () => {
    const seen = new Set<string>();
    assert.equal(shouldApplyEvent("a", seen), true);
    assert.equal(shouldApplyEvent("a", seen), false);
    assert.equal(shouldApplyEvent("b", seen), true);
    assert.equal(envelopeEventId({ eventId: "evt-1", data: {} }), "evt-1");
    assert.equal(envelopeEventId({}), "");
  });
});
