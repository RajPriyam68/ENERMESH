import { Prisma, type UserRole } from "@prisma/client";
import {
  DataQuality,
  DataSourceLabel,
  carbonMetric,
  labelledMetric,
  type AnalyticsBreakdownRow,
  type AnalyticsQuery,
  type AnalyticsSeriesPoint,
  type AnalyticsSnapshot,
  type LabelledMetric,
  undefinedAverageMetric,
  volumeWeightedPrice,
} from "@enermesh/shared";
import { prisma } from "../lib/prisma.js";
import { decimalNumber } from "./matching.service.js";

const LIVE_LISTING = ["ACTIVE", "PARTIALLY_FILLED"] as const;
const LIVE_BID = ["OPEN", "PARTIALLY_MATCHED"] as const;
const COMPLETED_TRADE = ["CONFIRMED", "COMPLETED"] as const;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function metricFromSum(value: number, unit: string, note: string): LabelledMetric {
  return labelledMetric(value, unit, DataSourceLabel.ACTUAL, DataQuality.HIGH, note);
}

function breakdown(map: Map<string, { kwh: number; value: number }>): AnalyticsBreakdownRow[] {
  return [...map.entries()]
    .sort((a, b) => b[1].kwh - a[1].kwh)
    .map(([key, row]) => ({
      key,
      energyTradedKwh: row.kwh,
      transactionValue: row.value,
      sourceLabel: DataSourceLabel.ACTUAL,
    }));
}

export async function getAnalytics(
  actor: { id: string; role: UserRole },
  query: AnalyticsQuery,
): Promise<AnalyticsSnapshot> {
  const now = new Date();
  const from = query.from;
  const until = query.until;
  const scope = actor.role === "ADMIN" ? "platform" : "self";
  const participant =
    scope === "self"
      ? { OR: [{ buyerId: actor.id }, { sellerId: actor.id }] }
      : {};

  const tradeWhere: Prisma.TradeWhereInput = {
    status: { in: [...COMPLETED_TRADE] },
    blockchainTxStatus: "CONFIRMED",
    ...participant,
    ...(from || until
      ? {
          createdAt: {
            ...(from ? { gte: from } : {}),
            ...(until ? { lte: until } : {}),
          },
        }
      : {}),
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
  };

  const listingWhere: Prisma.ListingWhereInput = {
    status: { in: [...LIVE_LISTING] },
    availableUntil: { gt: now },
    availableQuantityKwh: { gt: 0 },
    ...(scope === "self" ? { sellerId: actor.id } : {}),
    ...(query.energyType ? { energyType: query.energyType } : {}),
    ...(query.marketZone ? { marketZone: query.marketZone } : {}),
  };

  const bidWhere: Prisma.BidWhereInput = {
    status: { in: [...LIVE_BID] },
    requiredUntil: { gt: now },
    unmatchedKwh: { gt: 0 },
    ...(scope === "self" ? { buyerId: actor.id } : {}),
    ...(query.energyType ? { energyType: query.energyType } : {}),
    ...(query.marketZone ? { marketZone: query.marketZone } : {}),
  };

  const [trades, listings, bids] = await Promise.all([
    prisma.trade.findMany({
      where: tradeWhere,
      select: {
        quantityKwh: true,
        totalAmount: true,
        pricePerKwh: true,
        buyerId: true,
        sellerId: true,
        createdAt: true,
        settledAt: true,
        match: { select: { listing: { select: { energyType: true, marketZone: true } } } },
      },
    }),
    prisma.listing.findMany({
      where: listingWhere,
      select: { availableQuantityKwh: true },
    }),
    prisma.bid.findMany({
      where: bidWhere,
      select: { unmatchedKwh: true, requestedKwh: true, matchedKwh: true },
    }),
  ]);

  let energyTraded = 0;
  let transactionValue = 0;
  let revenue = 0;
  let spending = 0;
  let matchedKwh = 0;
  const byType = new Map<string, { kwh: number; value: number }>();
  const byZone = new Map<string, { kwh: number; value: number }>();
  const byDay = new Map<string, { kwh: number; value: number }>();

  for (const trade of trades) {
    const kwh = decimalNumber(trade.quantityKwh);
    const amount = decimalNumber(trade.totalAmount);
    energyTraded += kwh;
    transactionValue += amount;
    matchedKwh += kwh;
    if (scope === "platform" || trade.sellerId === actor.id) revenue += amount;
    if (scope === "platform" || trade.buyerId === actor.id) spending += amount;
    const type = trade.match.listing.energyType;
    const zone = trade.match.listing.marketZone;
    const typeRow = byType.get(type) ?? { kwh: 0, value: 0 };
    typeRow.kwh += kwh;
    typeRow.value += amount;
    byType.set(type, typeRow);
    const zoneRow = byZone.get(zone) ?? { kwh: 0, value: 0 };
    zoneRow.kwh += kwh;
    zoneRow.value += amount;
    byZone.set(zone, zoneRow);
    const key = dayKey(trade.settledAt ?? trade.createdAt);
    const dayRow = byDay.get(key) ?? { kwh: 0, value: 0 };
    dayRow.kwh += kwh;
    dayRow.value += amount;
    byDay.set(key, dayRow);
  }

  const supplyKwh = listings.reduce((sum, listing) => sum + decimalNumber(listing.availableQuantityKwh), 0);
  const unmatchedKwh = bids.reduce((sum, bid) => sum + decimalNumber(bid.unmatchedKwh), 0);
  const avg = volumeWeightedPrice(energyTraded, transactionValue);
  const renewableShareValue = energyTraded > 0 ? 1 : null;

  const series: AnalyticsSeriesPoint[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, row]) => ({
      date,
      energyTradedKwh: row.kwh,
      transactionValue: row.value,
      sourceLabel: DataSourceLabel.ACTUAL,
    }));

  return {
    scope,
    energyTradedKwh: metricFromSum(
      energyTraded,
      "kWh",
      "Confirmed and completed trades with verified chain receipts only.",
    ),
    transactionValue: metricFromSum(
      transactionValue,
      "currency",
      "Sum of confirmed trade totalAmount. Empty marketplace stays at 0.",
    ),
    averagePricePerKwh:
      avg === null
        ? undefinedAverageMetric("/kWh", "No confirmed trades in this window, so average price is undefined.")
        : labelledMetric(avg, "/kWh", DataSourceLabel.ACTUAL, DataQuality.HIGH, "Volume-weighted from confirmed trades."),
    supplyKwh: metricFromSum(supplyKwh, "kWh", "Remaining kWh on live ACTIVE/PARTIALLY_FILLED listings."),
    demandKwh: metricFromSum(unmatchedKwh, "kWh", "Unmatched kWh on live OPEN/PARTIALLY_MATCHED bids."),
    matchedKwh: metricFromSum(matchedKwh, "kWh", "Quantity from confirmed/completed trades in this scope."),
    unmatchedKwh: metricFromSum(unmatchedKwh, "kWh", "Remaining unmatched bid demand that is still open."),
    revenue: metricFromSum(
      revenue,
      "currency",
      scope === "self" ? "Confirmed sales where you are the seller." : "Confirmed platform sales.",
    ),
    spending: metricFromSum(
      spending,
      "currency",
      scope === "self" ? "Confirmed purchases where you are the buyer." : "Confirmed platform purchases.",
    ),
    renewableShare:
      renewableShareValue === null
        ? undefinedAverageMetric("share", "No confirmed trades, so renewable share is undefined.")
        : labelledMetric(
            renewableShareValue,
            "share",
            DataSourceLabel.ACTUAL,
            DataQuality.HIGH,
            "All EnerMesh energy types are renewable. Share is confirmed kWh / confirmed kWh.",
          ),
    estimatedCarbonSavingsKg: carbonMetric(energyTraded),
    byEnergyType: breakdown(byType),
    byMarketZone: breakdown(byZone),
    series,
    generatedAt: now.toISOString(),
  };
}
