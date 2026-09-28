import { z } from "zod";
import { AuditAction, UserRole } from "../enums.js";
import { paginationQuerySchema } from "./common.js";

const userRoleEnum = z.enum([UserRole.BUYER, UserRole.SELLER, UserRole.ADMIN]);

const auditActionEnum = z.enum([
  AuditAction.USER_REGISTERED,
  AuditAction.USER_LOGIN,
  AuditAction.LISTING_CREATED,
  AuditAction.LISTING_UPDATED,
  AuditAction.LISTING_CANCELLED,
  AuditAction.BID_CREATED,
  AuditAction.BID_CANCELLED,
  AuditAction.MATCH_CREATED,
  AuditAction.TRADE_SETTLED,
  AuditAction.WALLET_LINKED,
  AuditAction.ADMIN_ACTION,
]);

const booleanQuery = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === "true" || value === "1";
  });

export const adminUserQuerySchema = paginationQuerySchema
  .extend({
    role: userRoleEnum.optional(),
    isActive: booleanQuery,
    q: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export const adminUserPatchSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();

export const auditLogQuerySchema = paginationQuerySchema
  .extend({
    action: auditActionEnum.optional(),
    entityType: z.string().trim().min(1).max(64).optional(),
    entityId: z.string().trim().min(1).max(64).optional(),
    userId: z.string().uuid().optional(),
    from: z.coerce.date().optional(),
    until: z.coerce.date().optional(),
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

export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type AdminUserPatch = z.infer<typeof adminUserPatchSchema>;
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;
