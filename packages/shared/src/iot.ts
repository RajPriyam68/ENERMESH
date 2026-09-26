import { DataSourceLabel, type EnergyType } from "./enums.js";
import { roundKwh } from "./quantity.js";
import type {
  EnergyHistoryPublic,
  EnergyHistorySummary,
  IotAdapterName,
} from "./types.js";
import { IotAdapterName as Adapter } from "./types.js";

export function emptyEnergySummary(): EnergyHistorySummary {
  return {
    sampleCount: 0,
    totalKwh: 0,
    bySourceLabel: {
      [DataSourceLabel.ACTUAL]: { sampleCount: 0, totalKwh: 0 },
      [DataSourceLabel.ESTIMATED]: { sampleCount: 0, totalKwh: 0 },
      [DataSourceLabel.SIMULATED]: { sampleCount: 0, totalKwh: 0 },
    },
    firstRecordedAt: null,
    lastRecordedAt: null,
  };
}

export function summarizeEnergyHistory(
  rows: Array<{ kwh: number; sourceLabel: DataSourceLabel; recordedAt: string }>,
): EnergyHistorySummary {
  const summary = emptyEnergySummary();
  if (rows.length === 0) return summary;

  let first = rows[0]!.recordedAt;
  let last = rows[0]!.recordedAt;
  for (const row of rows) {
    const kwh = roundKwh(row.kwh);
    summary.sampleCount += 1;
    summary.totalKwh = roundKwh(summary.totalKwh + kwh);
    const bucket = summary.bySourceLabel[row.sourceLabel];
    bucket.sampleCount += 1;
    bucket.totalKwh = roundKwh(bucket.totalKwh + kwh);
    if (row.recordedAt < first) first = row.recordedAt;
    if (row.recordedAt > last) last = row.recordedAt;
  }
  summary.firstRecordedAt = first;
  summary.lastRecordedAt = last;
  return summary;
}

export interface SimulatedReadingDraft {
  kwh: number;
  recordedAt: Date;
  sourceLabel: typeof DataSourceLabel.SIMULATED;
  deviceId: string | undefined;
  energyType: EnergyType | undefined;
  adapter: typeof Adapter.SIMULATED;
}

export function buildSimulatedReadings(input: {
  kwh: number;
  samples: number;
  intervalMinutes: number;
  deviceId?: string;
  energyType?: EnergyType;
  now?: Date;
}): SimulatedReadingDraft[] {
  const kwh = roundKwh(input.kwh);
  const now = input.now ?? new Date();
  const intervalMs = input.intervalMinutes * 60_000;
  const drafts: SimulatedReadingDraft[] = [];
  for (let index = input.samples - 1; index >= 0; index -= 1) {
    drafts.push({
      kwh,
      recordedAt: new Date(now.getTime() - index * intervalMs),
      sourceLabel: DataSourceLabel.SIMULATED,
      deviceId: input.deviceId,
      energyType: input.energyType,
      adapter: Adapter.SIMULATED,
    });
  }
  return drafts;
}

export function adapterForSourceLabel(
  sourceLabel: DataSourceLabel,
  requested?: IotAdapterName,
): IotAdapterName {
  if (sourceLabel === DataSourceLabel.SIMULATED) return Adapter.SIMULATED;
  if (requested === Adapter.MQTT) return Adapter.MQTT;
  return Adapter.HTTP;
}

export function readingDoesNotAffectMarketplace(reading: Pick<EnergyHistoryPublic, "kwh" | "sourceLabel">): true {
  void reading;
  return true;
}
