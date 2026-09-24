import type { Notification, NotificationType, Prisma } from "@prisma/client";
import type { NotificationFilter, NotificationPublic } from "@enermesh/shared";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { emitNotification } from "../socket/index.js";

export function toPublicNotification(row: Notification): NotificationPublic {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    readAt: row.readAt?.toISOString() ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createNotification(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<NotificationPublic | null> {
  try {
    const prefs = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { notificationInApp: true },
    });
    if (!prefs?.notificationInApp) return null;
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: input.metadata,
      },
    });
    const publicRow = toPublicNotification(row);
    emitNotification(input.userId, publicRow);
    return publicRow;
  } catch {
    return null;
  }
}

export async function listNotifications(
  userId: string,
  filter: NotificationFilter,
): Promise<{
  notifications: NotificationPublic[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const page = filter.page;
  const pageSize = filter.pageSize;
  const where: Prisma.NotificationWhereInput = { userId };
  if (filter.unreadOnly) where.readAt = null;

  const [total, unreadCount, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: filter.sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    notifications: rows.map(toPublicNotification),
    unreadCount,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function markNotificationRead(userId: string, id: string): Promise<NotificationPublic> {
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing || existing.userId !== userId) {
    throw new HttpError(404, "NOTIFICATION_NOT_FOUND", "Notification not found");
  }
  if (existing.readAt) return toPublicNotification(existing);
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });
  return toPublicNotification(updated);
}

export async function markAllNotificationsRead(userId: string): Promise<{ updated: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
