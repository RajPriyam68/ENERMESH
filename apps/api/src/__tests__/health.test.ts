import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createApp } from "../app.js";

describe("health routes", () => {
  it("returns liveness payload", async () => {
    const app = createApp();
    const server = app.listen(0);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    const body = (await res.json()) as {
      success: boolean;
      data: { status: string; sprint: string; service: string };
    };
    server.close();
    assert.equal(res.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.status, "ok");
    assert.equal(body.data.sprint, "S1");
    assert.equal(body.data.service, "enermesh-api");
  });
});
