import { Router } from "express";
import { idParamSchema, notificationFilterSchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notification.service.js";

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

notificationsRouter.get(
  "/",
  validate({ query: notificationFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof notificationFilterSchema.parse>>(req);
    const result = await listNotifications(req.user!.id, filter);
    return ok(
      res,
      {
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

notificationsRouter.post(
  "/read-all",
  asyncHandler(async (req, res) => {
    const result = await markAllNotificationsRead(req.user!.id);
    return ok(res, result);
  }),
);

notificationsRouter.post(
  "/:id/read",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const notification = await markNotificationRead(req.user!.id, req.params.id as string);
    return ok(res, { notification });
  }),
);
