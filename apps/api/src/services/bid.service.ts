import type { Bid, Prisma } from "@prisma/client";
import type { BidFilter, BidPublic, MatchFilter, MatchPublic } from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { toPublicBid, toPublicMatch } from "./matching.service.js";

const BID_SORT: Record<string, keyof Bid> = {
  createdAt: "createdAt",
  maxPricePerKwh: "maxPricePerKwh",
  requestedKwh: "requestedKwh",
};

async function expireBidIfNeeded(bid: Bid): Promise<Bid> {
  if ((bid.status === "OPEN" || bid.status === "PARTIALLY_MATCHED") && bid.requiredUntil.getTime() <= Date.now()) {
    return prisma.bid.update({ where: { id: bid.id }, data: { status: "EXPIRED" } });
  }
  return bid;
}

export async function getBidById(
  actor: { id: string; role: string },
  id: string,
): Promise<BidPublic> {
  const bid = await prisma.bid.findUnique({ where: { id } });
  if (!bid) throw new HttpError(404, "BID_NOT_FOUND", "Bid not found");
  if (actor.role !== "ADMIN" && bid.buyerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only view your own bids");
  }
  return toPublicBid(await expireBidIfNeeded(bid));
}

export async function listBids(
  filter: BidFilter,
  actor: { id: string; role: string },
): Promise<{ bids: BidPublic[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const page = filter.page;
  const pageSize = filter.pageSize;
  const sortField = BID_SORT[filter.sortBy ?? "createdAt"] ?? "createdAt";
  const where: Prisma.BidWhereInput = {};
  if (actor.role !== "ADMIN") where.buyerId = actor.id;
  if (filter.energyType) where.energyType = filter.energyType;
  if (filter.marketZone) where.marketZone = filter.marketZone;
  if (filter.listingId) where.listingId = filter.listingId;
  if (filter.status) where.status = filter.status;

  const [total, rows] = await prisma.$transaction([
    prisma.bid.count({ where }),
    prisma.bid.findMany({
      where,
      orderBy: { [sortField]: filter.sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    bids: rows.map(toPublicBid),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function cancelBid(
  actor: { id: string; role: string },
  bidId: string,
): Promise<BidPublic> {
  const existing = await prisma.bid.findUnique({ where: { id: bidId } });
  if (!existing) throw new HttpError(404, "BID_NOT_FOUND", "Bid not found");
  const current = await expireBidIfNeeded(existing);
  if (actor.role !== "ADMIN" && current.buyerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only cancel your own bids");
  }
  if (current.status !== "OPEN" && current.status !== "PARTIALLY_MATCHED") {
    throw new HttpError(409, "BID_NOT_CANCELLABLE", `A ${current.status} bid cannot be cancelled`);
  }
  const cancelled = await prisma.bid.update({
    where: { id: bidId },
    data: { status: "CANCELLED" },
  });
  await recordAudit({
    userId: actor.id,
    action: "BID_CANCELLED",
    entityType: "Bid",
    entityId: bidId,
    metadata: { previousStatus: current.status },
  });
  return toPublicBid(cancelled);
}

export async function listMatches(
  filter: MatchFilter,
  actor: { id: string; role: string },
): Promise<{ matches: MatchPublic[]; page: number; pageSize: number; total: number; totalPages: number }> {
  const page = filter.page;
  const pageSize = filter.pageSize;
  const sortBy = filter.sortBy ?? "createdAt";
  const where: Prisma.MatchWhereInput = {};
  if (actor.role !== "ADMIN") {
    where.OR = [{ buyerId: actor.id }, { sellerId: actor.id }];
  }
  if (filter.listingId) where.listingId = filter.listingId;
  if (filter.bidId) where.bidId = filter.bidId;
  if (filter.status) where.status = filter.status;

  const [total, rows] = await prisma.$transaction([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      include: { listing: { select: { energyType: true, marketZone: true, location: true } } },
      orderBy: { [sortBy]: filter.sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return {
    matches: rows.map(toPublicMatch),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getMatchById(
  actor: { id: string; role: string },
  id: string,
): Promise<MatchPublic> {
  const match = await prisma.match.findUnique({
    where: { id },
    include: { listing: { select: { energyType: true, marketZone: true, location: true } } },
  });
  if (!match) throw new HttpError(404, "MATCH_NOT_FOUND", "Match not found");
  if (actor.role !== "ADMIN" && match.buyerId !== actor.id && match.sellerId !== actor.id) {
    throw new HttpError(403, "FORBIDDEN", "You can only view matches you participate in");
  }
  return toPublicMatch(match);
}
