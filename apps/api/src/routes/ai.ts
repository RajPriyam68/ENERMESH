import { Router } from "express";
import { aiInsightRequestSchema } from "@enermesh/shared";
import { createLimiter } from "../lib/rateLimit.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createAiInsight, getAiStatus } from "../services/ai.service.js";

export const aiRouter = Router();

const aiLimiter = createLimiter({
  windowMs: 60_000,
  limit: 20,
  message: "Too many advisory requests. Try again shortly.",
});

aiRouter.get(
  "/status",
  authenticate,
  authorize("BUYER", "SELLER", "ADMIN"),
  asyncHandler(async (_req, res) => {
    return ok(res, { status: getAiStatus() });
  }),
);

aiRouter.post(
  "/insights",
  authenticate,
  authorize("BUYER", "SELLER", "ADMIN"),
  aiLimiter,
  validate({ body: aiInsightRequestSchema }),
  asyncHandler(async (req, res) => {
    const result = await createAiInsight(
      { id: req.user!.id, role: req.user!.role },
      req.body,
      { ipAddress: req.ip },
    );
    return ok(res, result);
  }),
);
