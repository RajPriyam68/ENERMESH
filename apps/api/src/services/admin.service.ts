import { Prisma } from "@prisma/client";
import type {
  AdminUserPatch,
  AdminUserPublic,
  AdminUserQuery,
  AuditLogPublic,
  AuditLogQuery,
} from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";

function toAdminUser(user: {
  id: string;
  email: string;
  displayName: string;
  role: AdminUserPublic["role"];
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
}): AdminUserPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

function jsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isSerializationFailure(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2034";
}

async function runSerializable<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isSerializationFailure(error) || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}

export async function listAdminUsers(query: AdminUserQuery): Promise<{
  users: AdminUserPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const { page, pageSize, role, isActive, q } = query;
  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(isActive === undefined ? {} : { isActive }),
    ...(q
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { displayName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
  ]);
  return {
    users: users.map(toAdminUser),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}

export async function patchAdminUser(
  actor: { id: string },
  userId: string,
  input: AdminUserPatch,
  context: { ipAddress?: string | null },
): Promise<AdminUserPublic> {
  if (userId === actor.id) {
    throw new HttpError(409, "SELF_UPDATE_FORBIDDEN", "Administrators cannot change their own active status");
  }

  const updated = await runSerializable(async () =>
    prisma.$transaction(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: userId },
          select: { id: true, role: true, isActive: true },
        });
        if (!target) {
          throw new HttpError(404, "USER_NOT_FOUND", "User not found");
        }

        if (target.role === "ADMIN" && input.isActive === false) {
          const otherAdmins = await tx.user.count({
            where: { role: "ADMIN", isActive: true, id: { not: userId } },
          });
          if (otherAdmins === 0) {
            throw new HttpError(409, "LAST_ADMIN", "Cannot deactivate the last active administrator");
          }
        }

        const user = await tx.user.update({
          where: { id: userId },
          data: { isActive: input.isActive },
          select: {
            id: true,
            email: true,
            displayName: true,
            role: true,
            isActive: true,
            createdAt: true,
            lastLoginAt: true,
          },
        });
        if (input.isActive === false) {
          await tx.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        return user;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ),
  );

  await recordAudit({
    userId: actor.id,
    action: "ADMIN_ACTION",
    entityType: "User",
    entityId: userId,
    ipAddress: context.ipAddress ?? null,
    metadata: { operation: "set_active", isActive: input.isActive },
  });

  return toAdminUser(updated);
}

export async function listAuditLogs(query: AuditLogQuery): Promise<{
  logs: AuditLogPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const { page, pageSize, action, entityType, entityId, userId, from, until } = query;
  const where: Prisma.AuditLogWhereInput = {
    ...(action ? { action } : {}),
    ...(entityType ? { entityType } : {}),
    ...(entityId ? { entityId } : {}),
    ...(userId ? { userId } : {}),
    ...(from || until
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(until ? { lte: until } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { email: true, displayName: true } } },
    }),
  ]);

  return {
    logs: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      userEmail: row.user?.email ?? null,
      userDisplayName: row.user?.displayName ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      ipAddress: row.ipAddress,
      metadata: jsonRecord(row.metadata),
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}
