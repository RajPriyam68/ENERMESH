import type { User } from "@prisma/client";
import type { AuthTokens, PublicUser } from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { randomHex, sha256Hex } from "../lib/crypto.js";
import { refreshExpiryDate, signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

export interface RequestContext {
  ipAddress?: string | undefined;
}

export type { AuthTokens, PublicUser } from "@enermesh/shared";

/**
 * Fixed bcrypt hash used only to equalise login timing when the account does
 * not exist, so response time does not reveal whether an email is registered.
 */
const TIMING_EQUALIZER_HASH = "$2b$12$9B1tj1R9r2IPNQojrCU66O2ANmDBUJ35M20EbKDhf1tYuHdIOzKZi";

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    phone: user.phone,
    bio: user.bio,
    defaultMarketZone: user.defaultMarketZone,
    energyTypesOfInterest: user.energyTypesOfInterest,
    notificationEmail: user.notificationEmail,
    notificationInApp: user.notificationInApp,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

async function issueTokens(user: Pick<User, "id" | "email" | "role">): Promise<AuthTokens> {
  const tokenId = randomHex(24);
  const refreshToken = signRefreshToken({ userId: user.id, tokenId });
  const accessToken = signAccessToken({ userId: user.id, email: user.email, role: user.role });
  const accessExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  await prisma.refreshToken.create({
    data: {
      id: tokenId,
      userId: user.id,
      tokenHash: sha256Hex(refreshToken),
      expiresAt: refreshExpiryDate(refreshToken),
    },
  });

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: "15m",
    accessExpiresAt,
  };
}

export async function register(
  input: { email: string; password: string; displayName: string; role: "BUYER" | "SELLER" },
  ctx: RequestContext,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = input.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new HttpError(409, "EMAIL_IN_USE", "An account with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        displayName: input.displayName.trim(),
        role: input.role,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: created.id,
        action: "USER_REGISTERED",
        entityType: "User",
        entityId: created.id,
        ipAddress: ctx.ipAddress ?? null,
        metadata: { role: created.role },
      },
    });
    return created;
  });

  const tokens = await issueTokens(user);
  return { user: toPublicUser(user), tokens };
}

export async function login(
  input: { email: string; password: string },
  ctx: RequestContext,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  // Always run a bcrypt comparison so a missing account costs the same time as
  // a wrong password. Never reveal whether the email exists.
  const passwordMatches = await verifyPassword(
    input.password,
    user?.passwordHash ?? TIMING_EQUALIZER_HASH,
  );

  if (!user || !passwordMatches) {
    await recordAudit({
      action: "USER_LOGIN",
      entityType: "User",
      ipAddress: ctx.ipAddress,
      metadata: { outcome: "invalid_credentials", email },
    });
    throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }

  if (!user.isActive) {
    throw new HttpError(403, "ACCOUNT_DISABLED", "Account is disabled");
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await recordAudit({
    userId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: ctx.ipAddress,
    metadata: { outcome: "success" },
  });

  const tokens = await issueTokens(updated);
  return { user: toPublicUser(updated), tokens };
}

/**
 * Rotates a refresh token. The revoke + verify is atomic (updateMany guard) so
 * a token cannot be redeemed twice even under concurrent requests.
 */
export async function refresh(
  refreshToken: string,
  ctx: RequestContext,
): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const record = await prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
  if (
    !record ||
    record.userId !== payload.sub ||
    record.revokedAt !== null ||
    record.expiresAt.getTime() <= Date.now() ||
    record.tokenHash !== sha256Hex(refreshToken)
  ) {
    throw new HttpError(401, "INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired");
  }

  const revoked = await prisma.refreshToken.updateMany({
    where: { id: record.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count !== 1) {
    throw new HttpError(401, "REFRESH_TOKEN_REUSED", "Refresh token has already been used");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw new HttpError(401, "USER_NOT_FOUND", "Account no longer exists");
  }
  if (!user.isActive) {
    throw new HttpError(403, "ACCOUNT_DISABLED", "Account is disabled");
  }

  const tokens = await issueTokens(user);
  await recordAudit({
    userId: user.id,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: ctx.ipAddress,
    metadata: { outcome: "token_refreshed" },
  });

  return { user: toPublicUser(user), tokens };
}

export async function logout(
  userId: string,
  refreshToken: string | undefined,
  ctx: RequestContext,
): Promise<{ revoked: number }> {
  if (refreshToken) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      return { revoked: 0 };
    }
    if (payload.sub !== userId) {
      throw new HttpError(403, "FORBIDDEN", "Refresh token does not belong to this account");
    }
    const result = await prisma.refreshToken.updateMany({
      where: { id: payload.tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit({
      userId,
      action: "USER_LOGIN",
      entityType: "User",
      entityId: userId,
      ipAddress: ctx.ipAddress,
      metadata: { outcome: "logout", revoked: result.count },
    });
    return { revoked: result.count };
  }

  const result = await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await recordAudit({
    userId,
    action: "USER_LOGIN",
    entityType: "User",
    entityId: userId,
    ipAddress: ctx.ipAddress,
    metadata: { outcome: "logout_all", revoked: result.count },
  });
  return { revoked: result.count };
}

export async function getPublicUserById(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new HttpError(404, "USER_NOT_FOUND", "User not found");
  }
  return toPublicUser(user);
}
