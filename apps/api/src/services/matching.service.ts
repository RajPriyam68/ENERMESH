import { Prisma, type Bid, type BidStatus, type Listing, type ListingStatus, type Match } from "@prisma/client";
import type { BidPublic, CreateBidInput, MatchCandidateListing, MatchPublic } from "@enermesh/shared";
import {
  applyBidFill,
  applyFill,
  checkBidQuantity,
  checkQuantityIntegrity,
  matchBidAgainstListings,
  roundKwh,
  roundPrice,
} from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import {
  emitBidCreated,
  emitBidExpired,
  emitBidMatched,
  emitBidUpdated,
  emitListingUpdated,
  emitMatchCreated,
} from "../socket/index.js";
import { createNotification } from "./notification.service.js";

type ListingRow = Listing & { location: string };
type BidRow = Bid;
type MatchWithListing = Match & { listing: { energyType: Listing["energyType"]; marketZone: string; location: string } };

export function decimalNumber(value: { toString(): string } | number | string): number {
  return typeof value === "number" ? value : Number(value.toString());
}

export function toPublicBid(bid: BidRow): BidPublic {
  return {
    id: bid.id,
    buyerId: bid.buyerId,
    listingId: bid.listingId ?? undefined,
    requestedKwh: decimalNumber(bid.requestedKwh),
    unmatchedKwh: decimalNumber(bid.unmatchedKwh),
    matchedKwh: decimalNumber(bid.matchedKwh),
    maxPricePerKwh: decimalNumber(bid.maxPricePerKwh),
    energyType: bid.energyType,
    marketZone: bid.marketZone,
    requiredFrom: bid.requiredFrom.toISOString(),
    requiredUntil: bid.requiredUntil.toISOString(),
    status: bid.status,
    createdAt: bid.createdAt.toISOString(),
  };
}

export function toPublicMatch(match: MatchWithListing): MatchPublic {
  return {
    id: match.id,
    listingId: match.listingId,
    bidId: match.bidId,
    sellerId: match.sellerId,
    buyerId: match.buyerId,
    matchedKwh: decimalNumber(match.matchedKwh),
    pricePerKwh: decimalNumber(match.pricePerKwh),
    status: match.status,
    energyType: match.listing.energyType,
    marketZone: match.listing.marketZone,
    listingLocation: match.listing.location,
    createdAt: match.createdAt.toISOString(),
  };
}

function listingStatusAfterFill(available: number, sold: number): ListingStatus {
  if (available <= 0) return "SOLD_OUT";
  if (sold > 0) return "PARTIALLY_FILLED";
  return "ACTIVE";
}

function bidStatusAfterFill(unmatched: number, matched: number): BidStatus {
  if (unmatched <= 0) return "MATCHED";
  if (matched > 0) return "PARTIALLY_MATCHED";
  return "OPEN";
}

function collectErrorCodes(error: unknown, seen = new Set<unknown>()): string[] {
  if (typeof error !== "object" || error === null || seen.has(error)) return [];
  seen.add(error);
  const rec = error as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
  const codes: string[] = [];
  if (typeof rec.code === "string" || typeof rec.code === "number") codes.push(String(rec.code));
  if (typeof rec.meta?.code === "string" || typeof rec.meta?.code === "number") {
    codes.push(String(rec.meta.code));
  }
  codes.push(...collectErrorCodes(rec.cause, seen));
  return codes;
}

function isRetryableConcurrencyError(error: unknown): boolean {
  const codes = new Set(collectErrorCodes(error).map((code) => String(code).toUpperCase()));
  if (codes.has("P2034") || codes.has("40001") || codes.has("40P01")) return true;
  const rec = error as { message?: string; meta?: { message?: string } };
  const text = `${rec.message ?? ""} ${rec.meta?.message ?? ""}`.toLowerCase();
  return (
    text.includes("could not serialize") ||
    text.includes("serialization failure") ||
    text.includes("deadlock detected") ||
    text.includes("write conflict") ||
    text.includes("concurrent update")
  );
}

function backoffMs(attempt: number): number {
  return 15 * 2 ** attempt;
}

async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 8,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableConcurrencyError(error) || attempt >= attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  throw lastError;
}

function toCandidate(listing: ListingRow): MatchCandidateListing {
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    energyType: listing.energyType,
    availableQuantityKwh: decimalNumber(listing.availableQuantityKwh),
    minTradeKwh: decimalNumber(listing.minTradeKwh),
    maxTradeKwh: decimalNumber(listing.maxTradeKwh),
    pricePerKwh: decimalNumber(listing.pricePerKwh),
    marketZone: listing.marketZone,
    availableFrom: listing.availableFrom,
    availableUntil: listing.availableUntil,
    createdAt: listing.createdAt,
  };
}

async function lockListings(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const ordered = [...ids].sort();
  await tx.$queryRaw`
    SELECT id FROM "Listing"
    WHERE id IN (${Prisma.join(ordered)})
    ORDER BY id
    FOR UPDATE
  `;
}

async function loadMatchableListings(
  tx: Prisma.TransactionClient,
  bid: {
    listingId?: string;
    buyerId: string;
    energyType: Bid["energyType"];
    marketZone: string;
    maxPricePerKwh: number;
    requiredFrom: Date;
    requiredUntil: Date;
  },
): Promise<ListingRow[]> {
  const now = new Date();
  const where: Prisma.ListingWhereInput = {
    status: { in: ["ACTIVE", "PARTIALLY_FILLED"] },
    energyType: bid.energyType,
    marketZone: bid.marketZone,
    sellerId: { not: bid.buyerId },
    availableUntil: { gt: now.getTime() > bid.requiredFrom.getTime() ? now : bid.requiredFrom },
    availableQuantityKwh: { gt: 0 },
    pricePerKwh: { lte: bid.maxPricePerKwh },
    availableFrom: { lt: bid.requiredUntil },
  };
  if (bid.listingId) where.id = bid.listingId;

  const preview = await tx.listing.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" },
  });
  const ids = preview.map((row) => row.id);
  await lockListings(tx, ids);
  if (ids.length === 0) return [];

  const rows = await tx.listing.findMany({ where: { id: { in: ids } } });
  const live: ListingRow[] = [];
  for (const row of rows) {
    if (
      (row.status === "ACTIVE" || row.status === "PARTIALLY_FILLED") &&
      row.availableUntil.getTime() <= now.getTime()
    ) {
      await tx.listing.update({ where: { id: row.id }, data: { status: "EXPIRED" } });
      continue;
    }
    if (row.status !== "ACTIVE" && row.status !== "PARTIALLY_FILLED") continue;
    if (decimalNumber(row.availableQuantityKwh) <= 0) continue;
    if (row.availableFrom >= bid.requiredUntil || row.availableUntil <= bid.requiredFrom) continue;
    live.push(row);
  }
  return live;
}

async function persistFills(
  tx: Prisma.TransactionClient,
  bid: BidRow,
  listings: ListingRow[],
): Promise<{ bid: BidRow; matches: MatchWithListing[] }> {
  const candidates = listings.map(toCandidate);
  const planned = matchBidAgainstListings(
    {
      id: bid.id,
      buyerId: bid.buyerId,
      unmatchedKwh: decimalNumber(bid.unmatchedKwh),
      maxPricePerKwh: decimalNumber(bid.maxPricePerKwh),
      energyType: bid.energyType,
      marketZone: bid.marketZone,
      requiredFrom: bid.requiredFrom,
      requiredUntil: bid.requiredUntil,
      createdAt: bid.createdAt,
    },
    candidates,
  );

  let workingBid = {
    requestedKwh: decimalNumber(bid.requestedKwh),
    unmatchedKwh: decimalNumber(bid.unmatchedKwh),
    matchedKwh: decimalNumber(bid.matchedKwh),
  };
  const createdMatches: MatchWithListing[] = [];

  for (const plan of planned) {
    const listing = listings.find((row) => row.id === plan.listingId);
    if (!listing) continue;

    const remaining = {
      originalQuantityKwh: decimalNumber(listing.originalQuantityKwh),
      availableQuantityKwh: decimalNumber(listing.availableQuantityKwh),
      soldQuantityKwh: decimalNumber(listing.soldQuantityKwh),
    };
    const nextListing = applyFill(remaining, plan.matchedKwh);
    const listingCheck = checkQuantityIntegrity(nextListing);
    if (!listingCheck.ok) {
      throw new HttpError(409, "QUANTITY_INTEGRITY", listingCheck.reason ?? "Listing quantity integrity failed");
    }
    const nextBid = applyBidFill(workingBid, plan.matchedKwh);
    const bidCheck = checkBidQuantity(nextBid);
    if (!bidCheck.ok) {
      throw new HttpError(409, "QUANTITY_INTEGRITY", bidCheck.reason ?? "Bid quantity integrity failed");
    }

    await tx.listing.update({
      where: { id: listing.id },
      data: {
        availableQuantityKwh: nextListing.availableQuantityKwh,
        soldQuantityKwh: nextListing.soldQuantityKwh,
        status: listingStatusAfterFill(nextListing.availableQuantityKwh, nextListing.soldQuantityKwh),
      },
    });

    const match = await tx.match.create({
      data: {
        listingId: listing.id,
        bidId: bid.id,
        sellerId: listing.sellerId,
        buyerId: bid.buyerId,
        matchedKwh: roundKwh(plan.matchedKwh),
        pricePerKwh: roundPrice(plan.pricePerKwh),
        status: "PROPOSED",
      },
      include: { listing: { select: { energyType: true, marketZone: true, location: true } } },
    });
    createdMatches.push(match);
    workingBid = nextBid;
  }

  const updatedBid = await tx.bid.update({
    where: { id: bid.id },
    data: {
      unmatchedKwh: workingBid.unmatchedKwh,
      matchedKwh: workingBid.matchedKwh,
      status: bidStatusAfterFill(workingBid.unmatchedKwh, workingBid.matchedKwh),
    },
  });

  return { bid: updatedBid, matches: createdMatches };
}

export async function createBidAndMatch(
  buyerId: string,
  input: CreateBidInput,
): Promise<{ bid: BidPublic; matches: MatchPublic[] }> {
  if (input.requiredUntil.getTime() <= Date.now()) {
    throw new HttpError(422, "WINDOW_IN_PAST", "requiredUntil must be in the future");
  }

  const requested = roundKwh(input.requestedKwh);
  const bidCheck = checkBidQuantity({ requestedKwh: requested, unmatchedKwh: requested, matchedKwh: 0 });
  if (!bidCheck.ok) {
    throw new HttpError(422, "VALIDATION_ERROR", bidCheck.reason ?? "Invalid bid quantity");
  }

  const result = await withSerializableRetry(async (tx) => {
    if (input.listingId) {
      const listing = await tx.listing.findUnique({ where: { id: input.listingId } });
      if (!listing) {
        throw new HttpError(404, "LISTING_NOT_FOUND", "Listing not found");
      }
      if (listing.sellerId === buyerId) {
        throw new HttpError(409, "SELF_TRADE", "You cannot bid on your own listing");
      }
    }

    const created = await tx.bid.create({
      data: {
        buyerId,
        listingId: input.listingId,
        requestedKwh: requested,
        unmatchedKwh: requested,
        matchedKwh: 0,
        maxPricePerKwh: roundPrice(input.maxPricePerKwh),
        energyType: input.energyType,
        marketZone: input.marketZone.trim(),
        requiredFrom: input.requiredFrom,
        requiredUntil: input.requiredUntil,
        status: "OPEN",
      },
    });

    const listings = await loadMatchableListings(tx, {
      listingId: input.listingId,
      buyerId,
      energyType: created.energyType,
      marketZone: created.marketZone,
      maxPricePerKwh: decimalNumber(created.maxPricePerKwh),
      requiredFrom: created.requiredFrom,
      requiredUntil: created.requiredUntil,
    });

    return persistFills(tx, created, listings);
  });

  await recordAudit({
    userId: buyerId,
    action: "BID_CREATED",
    entityType: "Bid",
    entityId: result.bid.id,
    metadata: {
      requestedKwh: requested,
      matchedKwh: decimalNumber(result.bid.matchedKwh),
      matchCount: result.matches.length,
    },
  });
  for (const match of result.matches) {
    await recordAudit({
      userId: buyerId,
      action: "MATCH_CREATED",
      entityType: "Match",
      entityId: match.id,
      metadata: { listingId: match.listingId, matchedKwh: decimalNumber(match.matchedKwh) },
    });
  }

  return publishBidMatchResult(result, { created: true });
}

export async function rematchOpenBid(bidId: string): Promise<{ bid: BidPublic; matches: MatchPublic[] }> {
  const result = await withSerializableRetry(async (tx) => {
    const existing = await tx.bid.findUnique({ where: { id: bidId } });
    if (!existing) throw new HttpError(404, "BID_NOT_FOUND", "Bid not found");
    if (existing.status !== "OPEN" && existing.status !== "PARTIALLY_MATCHED") {
      throw new HttpError(409, "BID_NOT_MATCHABLE", `A ${existing.status} bid cannot be matched`);
    }
    if (existing.requiredUntil.getTime() <= Date.now()) {
      const expired = await tx.bid.update({ where: { id: bidId }, data: { status: "EXPIRED" } });
      return { bid: expired, matches: [] as MatchWithListing[] };
    }
    await tx.$queryRaw`SELECT id FROM "Bid" WHERE id = ${bidId} FOR UPDATE`;
    const locked = await tx.bid.findUniqueOrThrow({ where: { id: bidId } });
    const listings = await loadMatchableListings(tx, {
      listingId: locked.listingId ?? undefined,
      buyerId: locked.buyerId,
      energyType: locked.energyType,
      marketZone: locked.marketZone,
      maxPricePerKwh: decimalNumber(locked.maxPricePerKwh),
      requiredFrom: locked.requiredFrom,
      requiredUntil: locked.requiredUntil,
    });
    return persistFills(tx, locked, listings);
  });
  if (result.bid.status === "EXPIRED" && result.matches.length === 0) {
    const publicBid = toPublicBid(result.bid);
    emitBidExpired(publicBid);
    await createNotification({
      userId: publicBid.buyerId,
      type: "BID_EXPIRED",
      title: "Bid expired",
      body: `Your ${publicBid.energyType} bid in ${publicBid.marketZone} reached its required window.`,
      metadata: { bidId: publicBid.id },
    });
    return { bid: publicBid, matches: [] };
  }
  return publishBidMatchResult(result, { created: false });
}

async function publishBidMatchResult(
  result: {
    bid: BidRow;
    matches: MatchWithListing[];
  },
  options: { created: boolean },
): Promise<{ bid: BidPublic; matches: MatchPublic[] }> {
  const publicBid = toPublicBid(result.bid);
  const publicMatches = result.matches.map(toPublicMatch);
  if (options.created) emitBidCreated(publicBid);
  else emitBidUpdated(publicBid);
  if (publicMatches.length > 0) {
    emitBidMatched(
      publicBid,
      publicMatches.map((match) => match.sellerId),
    );
  }

  const listingIds = [...new Set(publicMatches.map((match) => match.listingId))];
  if (listingIds.length > 0) {
    const listings = await prisma.listing.findMany({
      where: { id: { in: listingIds } },
      include: { seller: { select: { displayName: true } } },
    });
    const { toPublicListing } = await import("./listing.service.js");
    for (const listing of listings) {
      emitListingUpdated(toPublicListing(listing));
    }
  }

  for (const match of publicMatches) {
    emitMatchCreated(match);
    await createNotification({
      userId: match.buyerId,
      type: "BID_MATCHED",
      title: "Bid matched",
      body: `${match.matchedKwh} kWh matched in ${match.marketZone} at ${match.pricePerKwh} / kWh.`,
      metadata: { matchId: match.id, listingId: match.listingId, bidId: match.bidId },
    });
    await createNotification({
      userId: match.sellerId,
      type: "BID_MATCHED",
      title: "Listing matched",
      body: `${match.matchedKwh} kWh of your ${match.energyType} offer was matched.`,
      metadata: { matchId: match.id, listingId: match.listingId, bidId: match.bidId },
    });
  }

  return { bid: publicBid, matches: publicMatches };
}
