import type { User } from "@prisma/client";
import { recordAudit } from "../lib/audit.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { toPublicUser, type PublicUser } from "./auth.service.js";

function requiredUser(user: User | null): User {
  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  }
  return user;
}

export async function getProfile(userId: string): Promise<PublicUser> {
  const user = requiredUser(await prisma.user.findUnique({ where: { id: userId } }));
  return toPublicUser(user);
}

export async function updateProfile(
  userId: string,
  input: { displayName?: string; phone?: string; bio?: string },
): Promise<PublicUser> {
  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = input.displayName.trim();
  if (input.phone !== undefined) data.phone = input.phone.trim() === "" ? null : input.phone.trim();
  if (input.bio !== undefined) data.bio = input.bio.trim() === "" ? null : input.bio.trim();

  if (Object.keys(data).length === 0) {
    return getProfile(userId);
  }

  const updated = requiredUser(
    await prisma.user.update({ where: { id: userId }, data }),
  );

  await recordAudit({
    userId,
    action: "ADMIN_ACTION",
    entityType: "User",
    entityId: userId,
    metadata: { operation: "profile_update", fields: Object.keys(data) },
  });

  return toPublicUser(updated);
}

export async function updateSettings(
  userId: string,
  input: {
    defaultMarketZone?: string;
    energyTypesOfInterest?: string[];
    notificationEmail?: boolean;
    notificationInApp?: boolean;
  },
): Promise<PublicUser> {
  const data: Record<string, unknown> = {};
  if (input.defaultMarketZone !== undefined) {
    data.defaultMarketZone =
      input.defaultMarketZone.trim() === "" ? null : input.defaultMarketZone.trim();
  }
  if (input.energyTypesOfInterest !== undefined) {
    data.energyTypesOfInterest = input.energyTypesOfInterest;
  }
  if (input.notificationEmail !== undefined) data.notificationEmail = input.notificationEmail;
  if (input.notificationInApp !== undefined) data.notificationInApp = input.notificationInApp;

  if (Object.keys(data).length === 0) {
    return getProfile(userId);
  }

  const updated = requiredUser(await prisma.user.update({ where: { id: userId }, data }));

  await recordAudit({
    userId,
    action: "ADMIN_ACTION",
    entityType: "User",
    entityId: userId,
    metadata: { operation: "settings_update", fields: Object.keys(data) },
  });

  return toPublicUser(updated);
}

export async function changePassword(
  userId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<{ revokedSessions: number }> {
  const user = requiredUser(await prisma.user.findUnique({ where: { id: userId } }));

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Current password is incorrect");
  }

  const passwordHash = await hashPassword(input.newPassword);

  const revokedSessions = await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    const revoked = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        userId,
        action: "ADMIN_ACTION",
        entityType: "User",
        entityId: userId,
        metadata: { operation: "password_change", revokedSessions: revoked.count },
      },
    });
    return revoked.count;
  });

  return { revokedSessions };
}
