import { z } from "zod";
import { EnergyType } from "../enums.js";
import { AiTopic } from "../types.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

export const aiInsightRequestSchema = z
  .object({
    topic: z.enum([AiTopic.MARKET, AiTopic.PRICE, AiTopic.LISTING, AiTopic.BID, AiTopic.DASHBOARD]),
    question: z.string().trim().min(1).max(500).optional(),
    energyType: energyTypeEnum.optional(),
    marketZone: z.string().trim().min(1).max(64).optional(),
    listingId: z.string().uuid().optional(),
    bidId: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.topic === AiTopic.LISTING && !value.listingId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["listingId"],
        message: "listingId is required when topic is listing",
      });
    }
    if (value.topic === AiTopic.BID && !value.bidId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bidId"],
        message: "bidId is required when topic is bid",
      });
    }
  });

export const aiModelOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(1200),
    bullets: z.array(z.string().trim().min(1).max(400)).max(8),
    caveats: z.array(z.string().trim().min(1).max(400)).max(6),
  })
  .strict();

export type AiInsightRequest = z.infer<typeof aiInsightRequestSchema>;
export type AiModelOutput = z.infer<typeof aiModelOutputSchema>;
