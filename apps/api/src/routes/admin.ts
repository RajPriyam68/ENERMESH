import { Router } from "express";
import { paginationQuerySchema } from "@enermesh/shared";
import { prisma } from "../lib/prisma.js";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

export const adminRouter = Router();

adminRouter.use(authenticate, authorize("ADMIN"));

adminRouter.get(
  "/users",
  validate({ query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const { page, pageSize } = req.validatedQuery as { page: number; pageSize: number };
    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
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

    return ok(
      res,
      {
        users: users.map((user) => ({
          ...user,
          createdAt: user.createdAt.toISOString(),
          lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        })),
      },
      { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    );
  }),
);
