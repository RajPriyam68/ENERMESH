import { z } from "zod";
import { BlockchainTxStatus, TradeStatus } from "../enums.js";
import { paginationQuerySchema } from "./common.js";

export const txHashSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, "Invalid transaction hash");

export const tradeActionSchema = z.enum(["purchase", "settle", "reject"]);

export const reportTradeSchema = z
  .object({
    matchId: z.string().uuid(),
    action: tradeActionSchema,
    txHash: txHashSchema.optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.action === "reject" && value.txHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["txHash"],
        message: "Rejected trades cannot include a transaction hash",
      });
    }
    if (value.action !== "reject" && !value.txHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["txHash"],
        message: "txHash is required for purchase and settle reports",
      });
    }
  });

export const tradeFilterSchema = paginationQuerySchema.extend({
  matchId: z.string().uuid().optional(),
  status: z
    .enum([
      TradeStatus.DRAFT,
      TradeStatus.AWAITING_SIGNATURE,
      TradeStatus.PENDING,
      TradeStatus.CONFIRMED,
      TradeStatus.FAILED,
      TradeStatus.REJECTED,
      TradeStatus.COMPLETED,
    ])
    .optional(),
  blockchainTxStatus: z
    .enum([
      BlockchainTxStatus.WAITING_FOR_SIGNATURE,
      BlockchainTxStatus.PENDING,
      BlockchainTxStatus.CONFIRMED,
      BlockchainTxStatus.FAILED,
      BlockchainTxStatus.REJECTED,
    ])
    .optional(),
  sortBy: z.enum(["createdAt", "updatedAt"]).optional(),
});

export type ReportTradeInput = z.infer<typeof reportTradeSchema>;
export type TradeFilter = z.infer<typeof tradeFilterSchema>;
export type TradeAction = z.infer<typeof tradeActionSchema>;
