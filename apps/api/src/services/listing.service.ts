import type { Listing, ListingStatus, Prisma } from "@prisma/client";
import type { CreateListingInput, ListingFilter, ListingPublic, UpdateListingInput } from "@enermesh/shared";
import {
  checkQuantityIntegrity,
  quantitiesFromAvailable,
  resizeRemaining,
  roundKwh,
  roundPrice,
} from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { createNotification } from "./notification.service.js";
import { emitListingCreated, emitListingExpired, emitListingUpdated } from "../socket/index.js";

const EDITABLE_STATUSES: ListingStatus[] = ["ACTIVE", "PARTIALLY_FILLED"];
const PUBLIC_BROWSE_STATUSES: ListingStatus[] = ["ACTIVE", "PARTIALLY_FILLED"];
const SORT_MAP: Record<string, keyof Listing> = {
  createdAt: "createdAt",
  pricePerKwh: "pricePerKwh",
  availableQuantityKwh: "availableQuantityKwh",
  availableFrom: "availableFrom",
  availableUntil: "availableUntil",
};

type ListingWithSeller = Listing & { seller: { displayName: string } };

function decimalNumber(value: { toString(): string } | number | string): number {
  return typeof value === "number" ? value : Number(value.toString());
}

export function toPublicListing(listing: ListingWithSeller): ListingPublic {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    sellerDisplayName: listing.seller.displayName,
    energyType: listing.energyType,
    originalQuantityKwh: decimalNumber(listing.originalQuantityKwh),
    availableQuantityKwh: decimalNumber(listing.availableQuantityKwh),
    soldQuantityKwh: decimalNumber(listing.soldQuantityKwh),
    minTradeKwh: decimalNumber(listing.minTradeKwh),
    maxTradeKwh: decimalNumber(listing.maxTradeKwh),
    pricePerKwh: decimalNumber(listing.pricePerKwh),
    location: listing.location,
    marketZone: listing.marketZone,
    availableFrom: listing.availableFrom.toISOString(),
    availableUntil: listing.availableUntil.toISOString(),
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    updatedAt: listing.updatedAt.toISOString(),
  };
}

function assertQuantity(q: {
  originalQuantityKwh: number;
  availableQuantityKwh: number;
  soldQuantityKwh: number;
}) {
  const check = checkQuantityIntegrity(q);
  if (!check.ok) {
    throw new HttpError(409, "QUANTITY_INTEGRITY", check.reason ?? "Quantity integrity check failed");
  }
}

function assertTradeSizes(available: number, minTrade: number, maxTrade: number) {
  if (minTrade > maxTrade) {
    throw new HttpError(422, "VALIDATION_ERROR", "minTradeKwh must be <= maxTradeKwh");
  }
  if (maxTrade > available) {
    throw new HttpError(422, "VALIDATION_ERROR", "maxTradeKwh must be <= availableQuantityKwh");
  }
}

async function expireIfNeeded(listing: ListingWithSeller): Promise<ListingWithSeller> {
  if (
    (listing.status === "ACTIVE" || listing.status === "PARTIALLY_FILLED") &&
    listing.availableUntil.getTime() <= Date.now()
  ) {
    const expired = await prisma.listing.update({
      where: { id: listing.id },
      data: { status: "EXPIRED" },
      include: { seller: { select: { displayName: true } } },
    });
    const publicListing = toPublicListing(expired);
    emitListingExpired(publicListing);
    await createNotification({
      userId: expired.sellerId,
      type: "LISTING_UPDATED",
      title: "Listing expired",
      body: `Your ${expired.energyType} offer in ${expired.marketZone} reached its availability window.`,
      metadata: { listingId: expired.id },
    });
    return expired;
  }
  return listing;
}

const listingInclude = { seller: { select: { displayName: true } } } as const;

export async function createListing(
  sellerId: string,
  input: CreateListingInput,
): Promise<ListingPublic> {
  const verifiedWallet = await prisma.wallet.findFirst({
    where: { userId: sellerId, verifiedAt: { not: null } },
    select: { id: true },
  });
  if (!verifiedWallet) {
    throw new HttpError(
      409,
      "WALLET_REQUIRED",
      "Verify a wallet before publishing a listing",
    );
  }

  if (input.availableUntil.getTime() <= Date.now()) {
    throw new HttpError(422, "WINDOW_IN_PAST", "availableUntil must be in the future");
  }

  const quantities = quantitiesFromAvailable(input.availableKwh);
  assertQuantity(quantities);
  assertTradeSizes(quantities.availableQuantityKwh, roundKwh(input.minTradeKwh), roundKwh(input.maxTradeKwh));

  const listing = await prisma.listing.create({
    data: {
      sellerId,
      energyType: input.energyType,
      originalQuantityKwh: quantities.originalQuantityKwh,
      availableQuantityKwh: quantities.availableQuantityKwh,
      soldQuantityKwh: 0,
      minTradeKwh: roundKwh(input.minTradeKwh),
      maxTradeKwh: roundKwh(input.maxTradeKwh),
      pricePerKwh: roundPrice(input.pricePerKwh),
      location: input.location.trim(),
      marketZone: input.marketZone.trim(),
      availableFrom: input.availableFrom,
      availableUntil: input.availableUntil,
      status: "ACTIVE",
    },
    include: listingInclude,
  });

  await recordAudit({
    userId: sellerId,
    action: "LISTING_CREATED",
    entityType: "Listing",
    entityId: listing.id,
    metadata: {
      energyType: listing.energyType,
      availableQuantityKwh: quantities.availableQuantityKwh,
      marketZone: listing.marketZone,
    },
  });

  const publicListing = toPublicListing(listing);
  emitListingCreated(publicListing);
  await createNotification({
    userId: sellerId,
    type: "LISTING_CREATED",
    title: "Listing published",
    body: `${publicListing.energyType} · ${publicListing.availableQuantityKwh} kWh in ${publicListing.marketZone} is live.`,
    metadata: { listingId: listing.id },
  });
  return publicListing;
}

export async function getListingById(id: string): Promise<ListingPublic> {
  const listing = await prisma.listing.findUnique({
    where: { id },
    include: listingInclude,
  });
  if (!listing) {
    throw new HttpError(404, "LISTING_NOT_FOUND", "Listing not found");
  }
  return toPublicListing(await expireIfNeeded(listing));
}

export async function listListings(
  filter: ListingFilter,
  options: { sellerId?: string; includeNonPublic?: boolean } = {},
): Promise<{ listings: ListingPublic[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const page = filter.page;
  const pageSize = filter.pageSize;
  const sortField = SORT_MAP[filter.sortBy ?? "createdAt"] ?? "createdAt";
  const sortOrder = filter.sortOrder;

  const where: Prisma.ListingWhereInput = {};

  if (options.sellerId) {
    where.sellerId = options.sellerId;
  }

  if (filter.status) {
    where.status = filter.status;
  } else if (!options.includeNonPublic) {
    where.status = { in: PUBLIC_BROWSE_STATUSES };
    where.availableUntil = { gt: new Date() };
  }

  if (filter.energyType) where.energyType = filter.energyType;
  if (filter.marketZone) where.marketZone = filter.marketZone;
  if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
    where.pricePerKwh = {
      ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
      ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
    };
  }
  if (filter.minKwh !== undefined) {
    where.availableQuantityKwh = { gte: filter.minKwh };
  }
  if (filter.availableFrom || filter.availableUntil) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      filter.availableUntil ? { availableFrom: { lt: filter.availableUntil } } : {},
      filter.availableFrom ? { availableUntil: { gt: filter.availableFrom } } : {},
    ];
  }
  if (filter.q) {
    where.OR = [
      { location: { contains: filter.q, mode: "insensitive" } },
      { marketZone: { contains: filter.q, mode: "insensitive" } },
    ];
  }

  const [total, rows] = await prisma.$transaction([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      include: listingInclude,
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    listings: rows.map(toPublicListing),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function updateListing(
  actor: { id: string; role: string },
  listingId: string,
  input: UpdateListingInput,
): Promise<ListingPublic> {
  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });
  if (!existing) {
    throw new HttpError(404, "LISTING_NOT_FOUND", "Listing not found");
  }
  const current = await expireIfNeeded(existing);

  if (actor.role !== "ADMIN" && current.sellerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only edit your own listings");
  }
  if (!EDITABLE_STATUSES.includes(current.status)) {
    throw new HttpError(409, "LISTING_NOT_EDITABLE", `A ${current.status} listing cannot be edited`);
  }

  const sold = decimalNumber(current.soldQuantityKwh);
  const nextAvailable =
    input.availableKwh !== undefined ? roundKwh(input.availableKwh) : decimalNumber(current.availableQuantityKwh);
  const quantities = resizeRemaining(
    {
      originalQuantityKwh: decimalNumber(current.originalQuantityKwh),
      availableQuantityKwh: decimalNumber(current.availableQuantityKwh),
      soldQuantityKwh: sold,
    },
    nextAvailable,
  );
  assertQuantity(quantities);

  const minTrade = roundKwh(input.minTradeKwh ?? decimalNumber(current.minTradeKwh));
  const maxTrade = roundKwh(input.maxTradeKwh ?? decimalNumber(current.maxTradeKwh));
  assertTradeSizes(quantities.availableQuantityKwh, minTrade, maxTrade);

  const availableFrom = input.availableFrom ?? current.availableFrom;
  const availableUntil = input.availableUntil ?? current.availableUntil;
  if (availableUntil <= availableFrom) {
    throw new HttpError(422, "VALIDATION_ERROR", "availableUntil must be after availableFrom");
  }
  if (availableUntil.getTime() <= Date.now()) {
    throw new HttpError(422, "WINDOW_IN_PAST", "availableUntil must be in the future");
  }

  const updated = await prisma.listing.update({
    where: { id: listingId },
    data: {
      energyType: input.energyType,
      originalQuantityKwh: quantities.originalQuantityKwh,
      availableQuantityKwh: quantities.availableQuantityKwh,
      minTradeKwh: minTrade,
      maxTradeKwh: maxTrade,
      pricePerKwh: input.pricePerKwh !== undefined ? roundPrice(input.pricePerKwh) : undefined,
      location: input.location?.trim(),
      marketZone: input.marketZone?.trim(),
      availableFrom,
      availableUntil,
    },
    include: listingInclude,
  });

  await recordAudit({
    userId: actor.id,
    action: "LISTING_UPDATED",
    entityType: "Listing",
    entityId: listingId,
    metadata: { fields: Object.keys(input) },
  });

  const publicListing = toPublicListing(updated);
  emitListingUpdated(publicListing);
  const priceChanged =
    input.pricePerKwh !== undefined &&
    roundPrice(input.pricePerKwh) !== decimalNumber(current.pricePerKwh);
  await createNotification({
    userId: current.sellerId,
    type: priceChanged ? "PRICE_CHANGED" : "LISTING_UPDATED",
    title: priceChanged ? "Listing price updated" : "Listing updated",
    body: `Your ${publicListing.energyType} offer in ${publicListing.marketZone} was updated.`,
    metadata: { listingId: listingId, fields: Object.keys(input) },
  });
  return publicListing;
}

export async function cancelListing(
  actor: { id: string; role: string },
  listingId: string,
): Promise<ListingPublic> {
  const existing = await prisma.listing.findUnique({
    where: { id: listingId },
    include: listingInclude,
  });
  if (!existing) {
    throw new HttpError(404, "LISTING_NOT_FOUND", "Listing not found");
  }
  const current = await expireIfNeeded(existing);

  if (actor.role !== "ADMIN" && current.sellerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only cancel your own listings");
  }
  if (!EDITABLE_STATUSES.includes(current.status)) {
    throw new HttpError(409, "LISTING_NOT_CANCELLABLE", `A ${current.status} listing cannot be cancelled`);
  }

  const cancelled = await prisma.listing.update({
    where: { id: listingId },
    data: { status: "CANCELLED" },
    include: listingInclude,
  });

  await recordAudit({
    userId: actor.id,
    action: "LISTING_CANCELLED",
    entityType: "Listing",
    entityId: listingId,
    metadata: { previousStatus: current.status },
  });

  const publicListing = toPublicListing(cancelled);
  emitListingUpdated(publicListing);
  await createNotification({
    userId: current.sellerId,
    type: "LISTING_UPDATED",
    title: "Listing cancelled",
    body: `Your ${publicListing.energyType} offer in ${publicListing.marketZone} is no longer available.`,
    metadata: { listingId },
  });
  return publicListing;
}
