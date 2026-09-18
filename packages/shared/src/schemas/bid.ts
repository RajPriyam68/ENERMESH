import { z } from "zod";
import { BidStatus, EnergyType, MatchStatus } from "../enums.js";
import { kwhSchema, moneySchema, paginationQuerySchema } from "./common.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

const bidStatusEnum = z.enum([
  BidStatus.OPEN,
  BidStatus.MATCHED,
  BidStatus.PARTIALLY_MATCHED,
  BidStatus.EXPIRED,
  BidStatus.CANCELLED,
  BidStatus.COMPLETED,
]);

export const createBidSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    requestedKwh: kwhSchema,
    maxPricePerKwh: moneySchema,
    energyType: energyTypeEnum,
    marketZone: z.string().trim().min(2).max(64),
    requiredFrom: z.coerce.date(),
    requiredUntil: z.coerce.date(),
  })
  .strict()
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
  energyType: energyTypeEnum.optional(),
  marketZone: z.string().trim().min(1).max(64).optional(),
  listingId: z.string().uuid().optional(),
  status: bidStatusEnum.optional(),
  sortBy: z.enum(["createdAt", "maxPricePerKwh", "requestedKwh"]).optional(),
});

export const matchFilterSchema = paginationQuerySchema.extend({
  listingId: z.string().uuid().optional(),
  bidId: z.string().uuid().optional(),
  status: z
    .enum([
      MatchStatus.PROPOSED,
      MatchStatus.ACCEPTED,
      MatchStatus.REJECTED,
      MatchStatus.EXPIRED,
      MatchStatus.SETTLEMENT_PENDING,
      MatchStatus.SETTLED,
      MatchStatus.FAILED,
    ])
    .optional(),
  sortBy: z.enum(["createdAt", "pricePerKwh", "matchedKwh"]).optional(),
});

export type CreateBidInput = z.infer<typeof createBidSchema>;
export type BidFilter = z.infer<typeof bidFilterSchema>;
export type MatchFilter = z.infer<typeof matchFilterSchema>;
