import type { EnergyHistory, Prisma } from "@prisma/client";
import {
  adapterForSourceLabel,
  buildSimulatedReadings,
  DataSourceLabel,
  emptyEnergySummary,
  IotAdapterName,
  roundKwh,
  summarizeEnergyHistory,
  type EnergyHistoryPublic,
  type EnergyHistoryQuery,
  type EnergyHistorySummary,
  type IngestEnergyReadingInput,
  type IotStatus,
  type SimulateEnergyReadingsInput,
} from "@enermesh/shared";
import { env } from "../config/env.js";
import { recordAudit } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../middleware/errorHandler.js";
import { emitDashboard, emitEnergyUpdated } from "../socket/index.js";

type Actor = { id: string; role: "BUYER" | "SELLER" | "ADMIN" };

function decimalNumber(value: { toString(): string } | number | string): number {
  return typeof value === "number" ? value : Number(value.toString());
}

function metadataOf(row: EnergyHistory): { adapter?: string; energyType?: string | null } {
  if (!row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return {};
  return row.metadata as { adapter?: string; energyType?: string | null };
}

export function toPublicEnergyHistory(row: EnergyHistory): EnergyHistoryPublic {
  const metadata = metadataOf(row);
  const sourceLabel = row.sourceLabel as EnergyHistoryPublic["sourceLabel"];
  const adapter =
    metadata.adapter === IotAdapterName.HTTP ||
    metadata.adapter === IotAdapterName.SIMULATED ||
    metadata.adapter === IotAdapterName.MQTT
      ? metadata.adapter
      : adapterForSourceLabel(sourceLabel);
  const energyType =
    metadata.energyType === "SOLAR" ||
    metadata.energyType === "WIND" ||
    metadata.energyType === "HYDRO" ||
    metadata.energyType === "BIOMASS" ||
    metadata.energyType === "MIXED_RENEWABLE"
      ? metadata.energyType
      : null;
  return {
    id: row.id,
    userId: row.userId,
    deviceId: row.deviceId,
    kwh: decimalNumber(row.kwh),
    recordedAt: row.recordedAt.toISOString(),
    sourceLabel,
    energyType,
    adapter,
    createdAt: row.createdAt.toISOString(),
  };
}

export function getIotStatus(): IotStatus {
  return {
    httpIngest: true,
    simulated: true,
    mqttConfigured: Boolean(env.MQTT_URL),
    mqttAvailable: false,
    writesMarketplace: false,
    advisoryOnly: true,
  };
}

function ownerScope(actor: Actor, requestedUserId?: string): string {
  if (requestedUserId && requestedUserId !== actor.id && actor.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "You cannot read another user's energy history");
  }
  if (requestedUserId && actor.role === "ADMIN") return requestedUserId;
  return actor.id;
}

function buildWhere(userId: string, query: EnergyHistoryQuery): Prisma.EnergyHistoryWhereInput {
  const where: Prisma.EnergyHistoryWhereInput = { userId };
  if (query.sourceLabel) where.sourceLabel = query.sourceLabel;
  if (query.deviceId) where.deviceId = query.deviceId;
  if (query.from || query.until) {
    where.recordedAt = {
      ...(query.from ? { gte: query.from } : {}),
      ...(query.until ? { lte: query.until } : {}),
    };
  }
  return where;
}

async function persistReading(
  actor: Actor,
  input: {
    kwh: number;
    recordedAt: Date;
    deviceId?: string;
    sourceLabel: EnergyHistoryPublic["sourceLabel"];
    energyType?: EnergyHistoryPublic["energyType"];
    adapter: EnergyHistoryPublic["adapter"];
  },
  ipAddress?: string | null,
): Promise<EnergyHistoryPublic> {
  const row = await prisma.energyHistory.create({
    data: {
      userId: actor.id,
      deviceId: input.deviceId ?? null,
      kwh: roundKwh(input.kwh),
      recordedAt: input.recordedAt,
      sourceLabel: input.sourceLabel,
      metadata: {
        adapter: input.adapter,
        energyType: input.energyType ?? null,
        writesMarketplace: false,
      },
    },
  });
  const sample = toPublicEnergyHistory(row);
  emitEnergyUpdated(sample);
  emitDashboard([actor.id], { reason: "energy", energyHistoryId: sample.id });
  await recordAudit({
    userId: actor.id,
    action: "ADMIN_ACTION",
    entityType: "EnergyHistory",
    entityId: sample.id,
    ipAddress: ipAddress ?? null,
    metadata: {
      sourceLabel: sample.sourceLabel,
      adapter: sample.adapter,
      kwh: sample.kwh,
      deviceId: sample.deviceId,
    },
  });
  return sample;
}

export async function ingestEnergyReading(
  actor: Actor,
  input: IngestEnergyReadingInput,
  meta: { ipAddress?: string | null } = {},
): Promise<EnergyHistoryPublic> {
  const sourceLabel = input.sourceLabel;
  return persistReading(
    actor,
    {
      kwh: input.kwh,
      recordedAt: input.recordedAt ?? new Date(),
      deviceId: input.deviceId,
      sourceLabel,
      energyType: input.energyType,
      adapter: adapterForSourceLabel(sourceLabel, IotAdapterName.HTTP),
    },
    meta.ipAddress,
  );
}

export async function simulateEnergyReadings(
  actor: Actor,
  input: SimulateEnergyReadingsInput,
  meta: { ipAddress?: string | null } = {},
): Promise<{ samples: EnergyHistoryPublic[]; summary: EnergyHistorySummary }> {
  const drafts = buildSimulatedReadings({
    kwh: input.kwh,
    samples: input.samples,
    intervalMinutes: input.intervalMinutes,
    deviceId: input.deviceId,
    energyType: input.energyType,
  });
  const samples: EnergyHistoryPublic[] = [];
  for (const draft of drafts) {
    samples.push(
      await persistReading(
        actor,
        {
          kwh: draft.kwh,
          recordedAt: draft.recordedAt,
          deviceId: draft.deviceId,
          sourceLabel: DataSourceLabel.SIMULATED,
          energyType: draft.energyType,
          adapter: IotAdapterName.SIMULATED,
        },
        meta.ipAddress,
      ),
    );
  }
  return { samples, summary: summarizeEnergyHistory(samples) };
}

export async function listEnergyHistory(
  actor: Actor,
  query: EnergyHistoryQuery,
): Promise<{
  samples: EnergyHistoryPublic[];
  summary: EnergyHistorySummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}> {
  const userId = ownerScope(actor, query.userId);
  const page = query.page;
  const pageSize = query.pageSize;
  const where = buildWhere(userId, query);
  const [total, rows, allForSummary] = await prisma.$transaction([
    prisma.energyHistory.count({ where }),
    prisma.energyHistory.findMany({
      where,
      orderBy: { recordedAt: query.sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.energyHistory.findMany({
      where,
      select: { kwh: true, sourceLabel: true, recordedAt: true },
    }),
  ]);
  const samples = rows.map(toPublicEnergyHistory);
  const summary = summarizeEnergyHistory(
    allForSummary.map((row) => ({
      kwh: decimalNumber(row.kwh),
      sourceLabel: row.sourceLabel as EnergyHistoryPublic["sourceLabel"],
      recordedAt: row.recordedAt.toISOString(),
    })),
  );
  return {
    samples,
    summary: total === 0 ? emptyEnergySummary() : summary,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 0,
  };
}
