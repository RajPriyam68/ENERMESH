import type { EnergyType } from "@prisma/client";
import {
  recommendPrice,
  type PriceObservation,
  type PriceRecommendation,
  type PriceRecommendationQuery,
} from "@enermesh/shared";
import { prisma } from "../lib/prisma.js";
import { decimalNumber } from "./matching.service.js";

const LIVE_LISTING = ["ACTIVE", "PARTIALLY_FILLED"] as const;
const LIVE_BID = ["OPEN", "PARTIALLY_MATCHED"] as const;
const COMPLETED_TRADE = ["CONFIRMED", "COMPLETED"] as const;

export async function getPriceRecommendation(query: PriceRecommendationQuery): Promise<PriceRecommendation> {
  const now = new Date();
  const [trades, listings, bids] = await Promise.all([
    prisma.trade.findMany({
      where: {
        status: { in: [...COMPLETED_TRADE] },
        blockchainTxStatus: "CONFIRMED",
        ...(query.energyType || query.marketZone
          ? {
              match: {
                listing: {
                  ...(query.energyType ? { energyType: query.energyType } : {}),
                  ...(query.marketZone ? { marketZone: query.marketZone } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        pricePerKwh: true,
        quantityKwh: true,
        settledAt: true,
        createdAt: true,
        match: { select: { listing: { select: { energyType: true, marketZone: true } } } },
      },
      take: 500,
      orderBy: { createdAt: "desc" },
    }),
    prisma.listing.findMany({
      where: {
        status: { in: [...LIVE_LISTING] },
        availableUntil: { gt: now },
        availableQuantityKwh: { gt: 0 },
        ...(query.energyType ? { energyType: query.energyType } : {}),
        ...(query.marketZone ? { marketZone: query.marketZone } : {}),
      },
      select: {
        pricePerKwh: true,
        availableQuantityKwh: true,
        energyType: true,
        marketZone: true,
        createdAt: true,
        availableFrom: true,
        availableUntil: true,
      },
      take: 500,
    }),
    prisma.bid.findMany({
      where: {
        status: { in: [...LIVE_BID] },
        requiredUntil: { gt: now },
        unmatchedKwh: { gt: 0 },
        ...(query.energyType ? { energyType: query.energyType } : {}),
        ...(query.marketZone ? { marketZone: query.marketZone } : {}),
      },
      select: {
        maxPricePerKwh: true,
        unmatchedKwh: true,
        energyType: true,
        marketZone: true,
        createdAt: true,
        requiredFrom: true,
        requiredUntil: true,
      },
      take: 500,
    }),
  ]);

  const observations: PriceObservation[] = [
    ...trades.map((trade) => ({
      kind: "trade" as const,
      pricePerKwh: decimalNumber(trade.pricePerKwh),
      quantityKwh: decimalNumber(trade.quantityKwh),
      energyType: trade.match.listing.energyType as EnergyType,
      marketZone: trade.match.listing.marketZone,
      occurredAt: trade.settledAt ?? trade.createdAt,
    })),
    ...listings.map((listing) => ({
      kind: "ask" as const,
      pricePerKwh: decimalNumber(listing.pricePerKwh),
      quantityKwh: decimalNumber(listing.availableQuantityKwh),
      energyType: listing.energyType as EnergyType,
      marketZone: listing.marketZone,
      occurredAt: listing.createdAt,
      windowFrom: listing.availableFrom,
      windowUntil: listing.availableUntil,
    })),
    ...bids.map((bid) => ({
      kind: "bid" as const,
      pricePerKwh: decimalNumber(bid.maxPricePerKwh),
      quantityKwh: decimalNumber(bid.unmatchedKwh),
      energyType: bid.energyType as EnergyType,
      marketZone: bid.marketZone,
      occurredAt: bid.createdAt,
      windowFrom: bid.requiredFrom,
      windowUntil: bid.requiredUntil,
    })),
  ];

  return recommendPrice({
    observations,
    energyType: query.energyType,
    marketZone: query.marketZone,
    windowFrom: query.availableFrom,
    windowUntil: query.availableUntil,
    now,
  });
}
