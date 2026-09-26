import { z } from "zod";
import { DataSourceLabel, EnergyType } from "../enums.js";
import { paginationQuerySchema } from "./common.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

const sourceLabelEnum = z.enum([
  DataSourceLabel.ACTUAL,
  DataSourceLabel.ESTIMATED,
  DataSourceLabel.SIMULATED,
]);

export const energySampleKwhSchema = z
  .number()
  .finite()
  .nonnegative("Quantity must be >= 0")
  .max(1_000_000)
  .multipleOf(0.001);

export const iotDeviceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9._:-]+$/, "deviceId must be alphanumeric with . _ : or -");

export const ingestEnergyReadingSchema = z
  .object({
    kwh: energySampleKwhSchema,
    recordedAt: z.coerce.date().optional(),
    deviceId: iotDeviceIdSchema.optional(),
    sourceLabel: sourceLabelEnum.default(DataSourceLabel.ACTUAL),
    energyType: energyTypeEnum.optional(),
  })
  .strict();

export const simulateEnergyReadingsSchema = z
  .object({
    kwh: energySampleKwhSchema,
    samples: z.coerce.number().int().min(1).max(24).default(4),
    intervalMinutes: z.coerce.number().int().min(1).max(1440).default(60),
    deviceId: iotDeviceIdSchema.optional(),
    energyType: energyTypeEnum.optional(),
  })
  .strict();

export const energyHistoryQuerySchema = paginationQuerySchema
  .extend({
    from: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
    sourceLabel: sourceLabelEnum.optional(),
    deviceId: iotDeviceIdSchema.optional(),
    userId: z.string().uuid().optional(),
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

export type IngestEnergyReadingInput = z.infer<typeof ingestEnergyReadingSchema>;
export type SimulateEnergyReadingsInput = z.infer<typeof simulateEnergyReadingsSchema>;
export type EnergyHistoryQuery = z.infer<typeof energyHistoryQuerySchema>;
