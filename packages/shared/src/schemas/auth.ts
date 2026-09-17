import { z } from "zod";
import { UserRole } from "../enums.js";
import { walletAddressSchema } from "./common.js";

export const registerSchema = z.object({
  email: z.string().email().max(255),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters")
    .max(128)
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[0-9]/, "Password must include a number"),
  displayName: z.string().trim().min(2).max(80),
  role: z.enum([UserRole.BUYER, UserRole.SELLER]),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const walletNonceSchema = z.object({
  address: walletAddressSchema,
  chainId: z.coerce.number().int().positive().optional(),
});

export const walletVerifySchema = z.object({
  address: walletAddressSchema,
  signature: z.string().min(10),
  nonce: z.string().min(8),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
