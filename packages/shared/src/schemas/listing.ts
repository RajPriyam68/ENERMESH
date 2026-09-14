import { z } from "zod";
import { EnergyType, ListingStatus } from "../enums.js";
import { kwhSchema, moneySchema, paginationQuerySchema } from "./common.js";

const listingFieldsSchema = z.object({
  energyType: z.enum([
    EnergyType.SOLAR,
    EnergyType.WIND,
    EnergyType.HYDRO,
    EnergyType.BIOMASS,
    EnergyType.MIXED_RENEWABLE,
  ]),
  availableKwh: kwhSchema,
  minTradeKwh: kwhSchema,
  maxTradeKwh: kwhSchema,
  pricePerKwh: moneySchema,
  location: z.string().trim().min(2).max(160),
  marketZone: z.string().trim().min(2).max(64),
  availableFrom: z.coerce.date(),
  availableUntil: z.coerce.date(),
});

export const createListingSchema = listingFieldsSchema.superRefine((value, ctx) => {
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
});

export const updateListingSchema = listingFieldsSchema.partial().extend({
  status: z
    .enum([
      ListingStatus.ACTIVE,
      ListingStatus.PARTIALLY_FILLED,
      ListingStatus.SOLD_OUT,
      ListingStatus.EXPIRED,
      ListingStatus.CANCELLED,
    ])
    .optional(),
});

export const listingFilterSchema = paginationQuerySchema.extend({
  energyType: z
    .enum([
      EnergyType.SOLAR,
      EnergyType.WIND,
      EnergyType.HYDRO,
      EnergyType.BIOMASS,
      EnergyType.MIXED_RENEWABLE,
    ])
    .optional(),
  marketZone: z.string().trim().min(1).max(64).optional(),
  status: z
    .enum([
      ListingStatus.ACTIVE,
      ListingStatus.PARTIALLY_FILLED,
      ListingStatus.SOLD_OUT,
      ListingStatus.EXPIRED,
      ListingStatus.CANCELLED,
    ])
    .optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  minKwh: z.coerce.number().positive().optional(),
  q: z.string().trim().max(120).optional(),
});

export type CreateListingInput = z.infer<typeof createListingSchema>;
export type ListingFilter = z.infer<typeof listingFilterSchema>;
