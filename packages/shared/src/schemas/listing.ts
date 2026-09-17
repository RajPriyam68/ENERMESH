import { z } from "zod";
import { EnergyType, ListingStatus } from "../enums.js";
import { kwhSchema, moneySchema, paginationQuerySchema } from "./common.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

const listingStatusEnum = z.enum([
  ListingStatus.ACTIVE,
  ListingStatus.PARTIALLY_FILLED,
  ListingStatus.SOLD_OUT,
  ListingStatus.EXPIRED,
  ListingStatus.CANCELLED,
]);

export const listingSortFields = ["createdAt", "pricePerKwh", "availableQuantityKwh", "availableFrom", "availableUntil"] as const;

const listingFieldsSchema = z.object({
  energyType: energyTypeEnum,
  availableKwh: kwhSchema,
  minTradeKwh: kwhSchema,
  maxTradeKwh: kwhSchema,
  pricePerKwh: moneySchema,
  location: z.string().trim().min(2).max(160),
  marketZone: z.string().trim().min(2).max(64),
  availableFrom: z.coerce.date(),
  availableUntil: z.coerce.date(),
}).strict();

function addTradeWindowIssues(
  value: {
    minTradeKwh: number;
    maxTradeKwh: number;
    availableKwh: number;
    availableFrom: Date;
    availableUntil: Date;
  },
  ctx: z.RefinementCtx,
) {
  if (value.minTradeKwh > value.maxTradeKwh) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["minTradeKwh"],
      message: "minTradeKwh must be <= maxTradeKwh",
    });
  }
  if (value.maxTradeKwh > value.availableKwh) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["maxTradeKwh"],
      message: "maxTradeKwh must be <= availableKwh",
    });
  }
  if (value.availableUntil <= value.availableFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["availableUntil"],
      message: "availableUntil must be after availableFrom",
    });
  }
}

export const createListingSchema = listingFieldsSchema.superRefine(addTradeWindowIssues);

export const updateListingSchema = z
  .object({
    energyType: energyTypeEnum.optional(),
    availableKwh: kwhSchema.optional(),
    minTradeKwh: kwhSchema.optional(),
    maxTradeKwh: kwhSchema.optional(),
    pricePerKwh: moneySchema.optional(),
    location: z.string().trim().min(2).max(160).optional(),
    marketZone: z.string().trim().min(2).max(64).optional(),
    availableFrom: z.coerce.date().optional(),
    availableUntil: z.coerce.date().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.minTradeKwh !== undefined &&
      value.maxTradeKwh !== undefined &&
      value.minTradeKwh > value.maxTradeKwh
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minTradeKwh"],
        message: "minTradeKwh must be <= maxTradeKwh",
      });
    }
    if (value.availableFrom && value.availableUntil && value.availableUntil <= value.availableFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availableUntil"],
        message: "availableUntil must be after availableFrom",
      });
    }
  });

export const listingFilterSchema = paginationQuerySchema
  .extend({
    energyType: energyTypeEnum.optional(),
    marketZone: z.string().trim().min(1).max(64).optional(),
    status: listingStatusEnum.optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    minKwh: z.coerce.number().positive().optional(),
    availableFrom: z.coerce.date().optional(),
    availableUntil: z.coerce.date().optional(),
    q: z.string().trim().max(120).optional(),
    sortBy: z.enum(listingSortFields).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxPrice"],
        message: "maxPrice must be >= minPrice",
      });
    }
  });

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type UpdateListingInput = z.infer<typeof updateListingSchema>;
export type ListingFilter = z.infer<typeof listingFilterSchema>;
