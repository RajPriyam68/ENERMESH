import { Router } from "express";
import { adminUserPatchSchema, adminUserQuerySchema, auditLogQuerySchema, idParamSchema } from "@enermesh/shared";
import { createLimiter } from "../lib/rateLimit.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { listAdminUsers, listAuditLogs, patchAdminUser } from "../services/admin.service.js";

export const adminRouter = Router();

const adminLimiter = createLimiter({
  windowMs: 60_000,
  limit: 40,
  message: "Too many admin requests. Try again shortly.",
});

adminRouter.use(authenticate, authorize("ADMIN"), adminLimiter);

adminRouter.get(
  "/users",
  validate({ query: adminUserQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof adminUserQuerySchema.parse>>(req);
    const result = await listAdminUsers(query);
    return ok(
      res,
      {
        users: result.users,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

adminRouter.patch(
  "/users/:id",
  validate({ params: idParamSchema, body: adminUserPatchSchema }),
  asyncHandler(async (req, res) => {
    const user = await patchAdminUser(req.user!, req.params.id as string, req.body, { ipAddress: req.ip });
    return ok(res, { user });
  }),
);

adminRouter.get(
  "/audit-logs",
  validate({ query: auditLogQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = getValidatedQuery<ReturnType<typeof auditLogQuerySchema.parse>>(req);
    const result = await listAuditLogs(query);
    return ok(
      res,
      {
        logs: result.logs,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);
