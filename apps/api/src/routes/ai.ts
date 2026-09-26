import { Router } from "express";
import rateLimit from "express-rate-limit";
import { aiInsightRequestSchema } from "@enermesh/shared";
import { env } from "../config/env.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createAiInsight, getAiStatus } from "../services/ai.service.js";

export const aiRouter = Router();

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => env.NODE_ENV === "test",
  message: {
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many advisory requests. Try again shortly." },
  },
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
