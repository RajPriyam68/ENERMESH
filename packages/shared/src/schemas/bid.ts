import { z } from "zod";
import { EnergyType } from "../enums.js";
import { kwhSchema, moneySchema, paginationQuerySchema } from "./common.js";

export const createBidSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    requestedKwh: kwhSchema,
    maxPricePerKwh: moneySchema,
    energyType: z.enum([
      EnergyType.SOLAR,
      EnergyType.WIND,
      EnergyType.HYDRO,
      EnergyType.BIOMASS,
      EnergyType.MIXED_RENEWABLE,
    ]),
    marketZone: z.string().trim().min(2).max(64),
    requiredFrom: z.coerce.date(),
    requiredUntil: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.requiredUntil <= value.requiredFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requiredUntil"],
        message: "requiredUntil must be after requiredFrom",
      });
    }
  });

export const bidFilterSchema = paginationQuerySchema.extend({
  energyType: z
    .enum([
      EnergyType.SOLAR,
      EnergyType.WIND,
      EnergyType.HYDRO,
      EnergyType.BIOMASS,
      EnergyType.MIXED_RENEWABLE,
    ])
    .optional(),
  marketZone: z.string().optional(),
  listingId: z.string().uuid().optional(),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;
