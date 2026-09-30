import { Prisma, type BlockchainTxStatus, type TradeStatus } from "@prisma/client";
import {
  BlockchainTxStatus as BlockchainTxStatusEnum,
  DataSourceLabel,
  TradeStatus as TradeStatusEnum,
  emptyTelemetryKwh,
  telemetryKwhFromSamples,
  type AnalyticsQuery,
  type MarketplaceReport,
  type ReportQuery,
  type SettlementReport,
  type TelemetryReport,
} from "@enermesh/shared";
import { prisma } from "../lib/prisma.js";
import { getAnalytics } from "./analytics.service.js";
import { decimalNumber } from "./matching.service.js";

const COMPLETED_TRADE = ["CONFIRMED", "COMPLETED"] as const;

function tradeWhere(query: AnalyticsQuery): Prisma.TradeWhereInput {
  return {
    ...(query.from || query.until
      ? {
          createdAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.until ? { lte: query.until } : {}),
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
}

function listingWhere(query: AnalyticsQuery): Prisma.ListingWhereInput {
  return {
    ...(query.energyType ? { energyType: query.energyType } : {}),
    ...(query.marketZone ? { marketZone: query.marketZone } : {}),
  };
}

function bidWhere(query: AnalyticsQuery): Prisma.BidWhereInput {
  return {
    ...(query.energyType ? { energyType: query.energyType } : {}),
    ...(query.marketZone ? { marketZone: query.marketZone } : {}),
  };
}

function emptyStatusCounts<T extends string>(values: readonly T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

export async function getMarketplaceReport(
  actor: { id: string; role: "ADMIN" },
  query: ReportQuery,
): Promise<MarketplaceReport> {
  const analytics = await getAnalytics(actor, query);
  const whereTrade = tradeWhere(query);
  const [listings, bids, matches, confirmedTrades] = await Promise.all([
    prisma.listing.count({ where: listingWhere(query) }),
    prisma.bid.count({ where: bidWhere(query) }),
    prisma.match.count({
      where: {
        ...(query.energyType || query.marketZone
          ? {
              listing: {
                ...(query.energyType ? { energyType: query.energyType } : {}),
                ...(query.marketZone ? { marketZone: query.marketZone } : {}),
              },
            }
          : {}),
      },
    }),
    prisma.trade.count({
      where: {
        ...whereTrade,
        status: { in: [...COMPLETED_TRADE] },
        blockchainTxStatus: "CONFIRMED",
      },
    }),
  ]);

  return {
    kind: "marketplace",
    analytics,
    counts: { listings, bids, matches, confirmedTrades },
    generatedAt: analytics.generatedAt,
  };
}

export async function getSettlementReport(
  actor: { id: string; role: "ADMIN" },
  query: ReportQuery,
): Promise<SettlementReport> {
  const analytics = await getAnalytics(actor, query);
  const where = tradeWhere(query);
  const [byStatus, byTxStatus] = await Promise.all([
    prisma.trade.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.trade.groupBy({ by: ["blockchainTxStatus"], where, _count: { _all: true } }),
  ]);

  const tradeStatusCounts = emptyStatusCounts(Object.values(TradeStatusEnum) as TradeStatus[]);
  for (const row of byStatus) {
    tradeStatusCounts[row.status] = row._count._all;
  }
  const blockchainTxStatusCounts = emptyStatusCounts(
    Object.values(BlockchainTxStatusEnum) as BlockchainTxStatus[],
  );
  for (const row of byTxStatus) {
    blockchainTxStatusCounts[row.blockchainTxStatus] = row._count._all;
  }

  return {
    kind: "settlement",
    analytics,
    tradeStatusCounts,
    blockchainTxStatusCounts,
    generatedAt: analytics.generatedAt,
  };
}

export async function getTelemetryReport(_actor: { id: string; role: "ADMIN" }, query: ReportQuery): Promise<TelemetryReport> {
  const where: Prisma.EnergyHistoryWhereInput = {
    ...(query.from || query.until
      ? {
          recordedAt: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.until ? { lte: query.until } : {}),
          },
        }
      : {}),
  };
  const [grouped, sampleCount] = await Promise.all([
    prisma.energyHistory.groupBy({
      by: ["sourceLabel"],
      where,
      _sum: { kwh: true },
      _count: { _all: true },
    }),
    prisma.energyHistory.count({ where }),
  ]);

  const bySourceLabel: TelemetryReport["bySourceLabel"] = {
    [DataSourceLabel.ACTUAL]: { sampleCount: 0, totalKwh: 0 },
    [DataSourceLabel.ESTIMATED]: { sampleCount: 0, totalKwh: 0 },
    [DataSourceLabel.SIMULATED]: { sampleCount: 0, totalKwh: 0 },
  };
  let totalKwh = 0;
  for (const row of grouped) {
    const kwh = decimalNumber(row._sum.kwh ?? 0);
    totalKwh += kwh;
    bySourceLabel[row.sourceLabel] = {
      sampleCount: row._count._all,
      totalKwh: kwh,
    };
  }

  return {
    kind: "telemetry",
    sampleCount,
    totalKwh:
      sampleCount === 0
        ? emptyTelemetryKwh("No EnergyHistory samples in this window. Empty telemetry stays at actual 0.")
        : telemetryKwhFromSamples(totalKwh, sampleCount),
    bySourceLabel,
    generatedAt: new Date().toISOString(),
  };
}
