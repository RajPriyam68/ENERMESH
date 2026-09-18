import { Router } from "express";
import { bidFilterSchema, createBidSchema, idParamSchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { cancelBid, getBidById, listBids } from "../services/bid.service.js";
import { createBidAndMatch } from "../services/matching.service.js";

export const bidsRouter = Router();

bidsRouter.get(
  "/",
  authenticate,
  authorize("BUYER", "ADMIN"),
  validate({ query: bidFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof bidFilterSchema.parse>>(req);
    const result = await listBids(filter, req.user!);
    return ok(
      res,
      {
        bids: result.bids,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

bidsRouter.get(
  "/:id",
  authenticate,
  authorize("BUYER", "ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const bid = await getBidById(req.user!, req.params.id as string);
    return ok(res, { bid });
  }),
);

bidsRouter.post(
  "/",
  authenticate,
  authorize("BUYER", "ADMIN"),
  validate({ body: createBidSchema }),
  asyncHandler(async (req, res) => {
    const result = await createBidAndMatch(req.user!.id, req.body);
    return ok(res, result, undefined, 201);
  }),
);

bidsRouter.post(
  "/:id/cancel",
  authenticate,
  authorize("BUYER", "ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const bid = await cancelBid(req.user!, req.params.id as string);
    return ok(res, { bid });
  }),
);
