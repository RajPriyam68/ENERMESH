import { Router } from "express";
import rateLimit from "express-rate-limit";
import { energyHistoryQuerySchema, ingestEnergyReadingSchema, simulateEnergyReadingsSchema } from "@enermesh/shared";
import { env } from "../config/env.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import {
  getIotStatus,
  ingestEnergyReading,
  listEnergyHistory,
  simulateEnergyReadings,
} from "../services/iot.service.js";

export const iotRouter = Router();

const iotLimiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many telemetry requests. Try again shortly." },
  },
});

iotRouter.use(authenticate);
iotRouter.use(authorize("BUYER", "SELLER", "ADMIN"));

iotRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    return ok(res, { status: getIotStatus() });
  }),
);

iotRouter.get(
  "/history",
  validate({ query: energyHistoryQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof energyHistoryQuerySchema.parse>>(req);
    const result = await listEnergyHistory({ id: req.user!.id, role: req.user!.role }, query);
    return ok(
      res,
      {
        samples: result.samples,
        summary: result.summary,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

iotRouter.post(
  "/readings",
  iotLimiter,
  validate({ body: ingestEnergyReadingSchema }),
  asyncHandler(async (req, res) => {
    const sample = await ingestEnergyReading({ id: req.user!.id, role: req.user!.role }, req.body, {
      ipAddress: req.ip,
    });
    return ok(res, { sample }, undefined, 201);
  }),
);

iotRouter.post(
  "/simulate",
  iotLimiter,
  validate({ body: simulateEnergyReadingsSchema }),
  asyncHandler(async (req, res) => {
    const result = await simulateEnergyReadings({ id: req.user!.id, role: req.user!.role }, req.body, {
      ipAddress: req.ip,
    });
    return ok(res, result, undefined, 201);
  }),
);
