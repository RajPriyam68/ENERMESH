import { Router } from "express";
import { priceRecommendationQuerySchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getPriceRecommendation } from "../services/price.service.js";

export const pricingRouter = Router();

pricingRouter.get(
  "/recommendation",
  authenticate,
  authorize("SELLER", "BUYER", "ADMIN"),
  validate({ query: priceRecommendationQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof priceRecommendationQuerySchema.parse>>(req);
    const recommendation = await getPriceRecommendation(query);
    return ok(res, { recommendation });
  }),
);
