import { z } from "zod";
import { EnergyType } from "../enums.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

export const priceRecommendationQuerySchema = z
  .object({
    energyType: energyTypeEnum.optional(),
    marketZone: z.string().trim().min(1).max(64).optional(),
    availableFrom: z.coerce.date().optional(),
    availableUntil: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.availableFrom && value.availableUntil && value.availableUntil <= value.availableFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availableUntil"],
        message: "availableUntil must be after availableFrom",
      });
    }
  });

export const analyticsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
    energyType: energyTypeEnum.optional(),
    marketZone: z.string().trim().min(1).max(64).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.until && value.until <= value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["until"],
        message: "until must be after from",
      });
    }
  });

export type PriceRecommendationQuery = z.infer<typeof priceRecommendationQuerySchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
