import { Router } from "express";
import { reportQuerySchema } from "@enermesh/shared";
import { createLimiter } from "../lib/rateLimit.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getMarketplaceReport, getSettlementReport, getTelemetryReport } from "../services/report.service.js";

export const reportsRouter = Router();

const reportLimiter = createLimiter({
  windowMs: 60_000,
  limit: 40,
  message: "Too many report requests. Try again shortly.",
});

reportsRouter.use(authenticate, authorize("ADMIN"), reportLimiter);

reportsRouter.get(
  "/marketplace",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof reportQuerySchema.parse>>(req);
    const report = await getMarketplaceReport({ id: req.user!.id, role: "ADMIN" }, query);
    return ok(res, { report });
  }),
);

reportsRouter.get(
  "/settlement",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof reportQuerySchema.parse>>(req);
    const report = await getSettlementReport({ id: req.user!.id, role: "ADMIN" }, query);
    return ok(res, { report });
  }),
);

reportsRouter.get(
  "/telemetry",
  validate({ query: reportQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof reportQuerySchema.parse>>(req);
    const report = await getTelemetryReport({ id: req.user!.id, role: "ADMIN" }, query);
    return ok(res, { report });
  }),
);
