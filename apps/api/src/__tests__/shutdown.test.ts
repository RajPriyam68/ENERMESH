import assert from "node:assert/strict";
import { createServer } from "node:http";
import { describe, it } from "node:test";
import { closeHttpServer } from "../lib/shutdown.js";

describe("production shutdown helpers", () => {
  it("stops accepting connections on a listening HTTP server", async () => {
    const server = createServer((_req, res) => {
      res.end("ok");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    assert.equal(server.listening, true);
    await closeHttpServer(server);
    assert.equal(server.listening, false);
  });

  it("is idempotent when the server is already closed", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    await closeHttpServer(server);
    await closeHttpServer(server);
    assert.equal(server.listening, false);
  });
});
