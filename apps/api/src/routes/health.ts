import { Router } from "express";
import { env } from "../config/env.js";
import { pingDatabase } from "../lib/prisma.js";
import { fail, ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { openApiDocument } from "../docs/openapi.js";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    ok(res, {
      status: "ok",
      service: "enermesh-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      database: "unknown",
      sprint: "S1",
      chain: {
        chainId: env.CHAIN_ID,
        name: env.CHAIN_NAME,
      },
    });
  }),
);

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const connected = await pingDatabase();
    const payload = {
      status: connected ? "ok" : "degraded",
      service: "enermesh-api",
      version: "0.1.0",
      timestamp: new Date().toISOString(),
      database: connected ? "connected" : "disconnected",
      sprint: "S1",
    };
    if (!connected) {
      return fail(res, "NOT_READY", "Database is not reachable", 503, payload);
    }
    return ok(res, payload);
  }),
);

healthRouter.get("/docs.json", (_req, res) => {
  res.json(openApiDocument);
});
