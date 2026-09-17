import { Router } from "express";
import {
  createListingSchema,
  idParamSchema,
  listingFilterSchema,
  updateListingSchema,
} from "@enermesh/shared";
import { ok } from "../lib/response.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";
import { getValidatedQuery, validate } from "../middleware/validate.js";
import {
  cancelListing,
  createListing,
  getListingById,
  listListings,
  updateListing,
} from "../services/listing.service.js";

export const listingsRouter = Router();

listingsRouter.get(
  "/",
  validate({ query: listingFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof listingFilterSchema.parse>>(req);
    const result = await listListings(filter);
    return ok(
      res,
      {
        listings: result.listings,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

listingsRouter.get(
  "/mine",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate({ query: listingFilterSchema }),
  asyncHandler(async (req, res) => {
    const filter = getValidatedQuery<ReturnType<typeof listingFilterSchema.parse>>(req);
    const result = await listListings(filter, { sellerId: req.user!.id, includeNonPublic: true });
    return ok(
      res,
      {
        listings: result.listings,
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      },
      { page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages },
    );
  }),
);

listingsRouter.get(
  "/:id",
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const listing = await getListingById(req.params.id as string);
    return ok(res, { listing });
  }),
);

listingsRouter.post(
  "/",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate({ body: createListingSchema }),
  asyncHandler(async (req, res) => {
    const listing = await createListing(req.user!.id, req.body);
    return ok(res, { listing }, undefined, 201);
  }),
);

listingsRouter.patch(
  "/:id",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate({ params: idParamSchema, body: updateListingSchema }),
  asyncHandler(async (req, res) => {
    if (Object.keys(req.body).length === 0) {
      throw new HttpError(422, "VALIDATION_ERROR", "No fields to update");
    }
    const listing = await updateListing(req.user!, req.params.id as string, req.body);
    return ok(res, { listing });
  }),
);

listingsRouter.post(
  "/:id/cancel",
  authenticate,
  authorize("SELLER", "ADMIN"),
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    const listing = await cancelListing(req.user!, req.params.id as string);
    return ok(res, { listing });
  }),
);
