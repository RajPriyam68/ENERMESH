import { DataQuality, DataSourceLabel } from "./enums.js";
import { labelledMetric } from "./analytics.js";
import type { LabelledMetric } from "./types.js";

export function emptyTelemetryKwh(note: string): LabelledMetric {
  return labelledMetric(0, "kWh", DataSourceLabel.ACTUAL, DataQuality.HIGH, note);
}

export function telemetryKwhFromSamples(totalKwh: number, sampleCount: number): LabelledMetric {
  if (!Number.isFinite(totalKwh) || totalKwh < 0 || sampleCount <= 0) {
    return emptyTelemetryKwh("No EnergyHistory samples in this window. Empty telemetry stays at actual 0.");
  }
  return labelledMetric(
    totalKwh,
    "kWh",
    DataSourceLabel.ACTUAL,
    DataQuality.HIGH,
    "Sum of stored EnergyHistory kWh. Simulated and estimated samples stay labelled on the breakdown, not as marketplace volume.",
  );
}
