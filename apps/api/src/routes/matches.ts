import { Router } from "express";
import { idParamSchema, matchFilterSchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getMatchById, listMatches } from "../services/bid.service.js";

export const matchesRouter = Router();

matchesRouter.get(
  "/",
  authenticate,
  validate({ query: matchFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof matchFilterSchema.parse>>(req);
    const result = await listMatches(filter, req.user!);
    return ok(
      res,
      {
        matches: result.matches,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

matchesRouter.get(
  "/:id",
  authenticate,
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const match = await getMatchById(req.user!, req.params.id as string);
    return ok(res, { match });
  }),
);
