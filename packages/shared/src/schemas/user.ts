import { z } from "zod";
import { EnergyType } from "../enums.js";
import { passwordSchema } from "./auth.js";

const energyTypeEnum = z.enum([
  EnergyType.SOLAR,
  EnergyType.WIND,
  EnergyType.HYDRO,
  EnergyType.BIOMASS,
  EnergyType.MIXED_RENEWABLE,
]);

export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    phone: z
      .string()
      .trim()
      .max(32)
      .regex(/^[+0-9 ()-]*$/, "Phone may only contain digits, spaces, +, -, ( )")
      .optional()
      .or(z.literal("")),
    bio: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .strict();

export const updateSettingsSchema = z
  .object({
    defaultMarketZone: z.string().trim().min(2).max(64).optional().or(z.literal("")),
    energyTypesOfInterest: z.array(energyTypeEnum).max(5).optional(),
    notificationEmail: z.boolean().optional(),
    notificationInApp: z.boolean().optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, {
    path: ["newPassword"],
    message: "New password must differ from the current password",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
