import { Router } from "express";
import { analyticsQuerySchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getAnalytics } from "../services/analytics.service.js";

export const analyticsRouter = Router();

analyticsRouter.get(
  "/",
  authenticate,
  authorize("BUYER", "SELLER", "ADMIN"),
  validate({ query: analyticsQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof analyticsQuerySchema.parse>>(req);
    const analytics = await getAnalytics({ id: req.user!.id, role: req.user!.role }, query);
    return ok(res, { analytics });
  }),
);
