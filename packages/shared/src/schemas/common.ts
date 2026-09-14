import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../constants.js";

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export const idParamSchema = z.object({
  id: z.string().uuid(),
});

export const walletAddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "Invalid EVM wallet address");

export const isoDateSchema = z.coerce.date();

export const moneySchema = z
  .number()
  .finite()
  .nonnegative("Amount must be >= 0")
  .multipleOf(0.0001);

export const kwhSchema = z
  .number()
  .finite()
  .positive("Quantity must be > 0")
  .multipleOf(0.001);

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
