import { Router } from "express";
import { reportQuerySchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getMarketplaceReport, getSettlementReport, getTelemetryReport } from "../services/report.service.js";

export const reportsRouter = Router();

reportsRouter.use(authenticate, authorize("ADMIN"));

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
