import { Router } from "express";
import { idParamSchema, reportTradeSchema, tradeFilterSchema } from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate } from "../middleware/auth.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import { getTradeById, listTrades, reportTrade } from "../services/settlement.service.js";

export const tradesRouter = Router();

tradesRouter.use(authenticate);

tradesRouter.get(
  "/",
  validate({ query: tradeFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof tradeFilterSchema.parse>>(req);
    const result = await listTrades(req.user!, filter);
    return ok(
      res,
      {
        trades: result.trades,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

tradesRouter.post(
  "/report",
  validate({ body: reportTradeSchema }),
  asyncHandler(async (req, res) => {
    const trade = await reportTrade(req.user!, req.body);
    return ok(res, { trade });
  }),
);

tradesRouter.get(
  "/:id",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const trade = await getTradeById(req.user!, req.params.id as string);
    return ok(res, { trade });
  }),
);
