import { DataQuality, DataSourceLabel, EnergyType } from "./enums.js";
import { ESTIMATED_GRID_KG_CO2_PER_KWH } from "./constants.js";
import { roundPrice } from "./quantity.js";
import type { LabelledMetric } from "./types.js";

export function labelledMetric(
  value: number | null,
  unit: string,
  sourceLabel: DataSourceLabel,
  dataQuality: DataQuality,
  note: string,
): LabelledMetric {
  return { value, unit, sourceLabel, dataQuality, note };
}

export function estimateCarbonSavingsKg(
  tradedKwh: number,
  kgPerKwh = ESTIMATED_GRID_KG_CO2_PER_KWH,
): number {
  if (!Number.isFinite(tradedKwh) || tradedKwh <= 0) return 0;
  if (!Number.isFinite(kgPerKwh) || kgPerKwh < 0) return 0;
  return Math.round(tradedKwh * kgPerKwh * 1000) / 1000;
}

export function renewableShare(tradedByType: Partial<Record<EnergyType, number>>): number | null {
  const total = Object.values(tradedByType).reduce((sum, value) => sum + (value ?? 0), 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  const renewable = (Object.keys(EnergyType) as EnergyType[]).reduce(
    (sum, type) => sum + (tradedByType[type] ?? 0),
    0,
  );
  return roundPrice(renewable / total);
}

export function volumeWeightedPrice(quantityKwh: number, totalAmount: number): number | null {
  if (!Number.isFinite(quantityKwh) || quantityKwh <= 0) return null;
  if (!Number.isFinite(totalAmount) || totalAmount < 0) return null;
  return roundPrice(totalAmount / quantityKwh);
}

export function emptySumMetric(unit: string, note: string): LabelledMetric {
  return labelledMetric(0, unit, DataSourceLabel.ACTUAL, DataQuality.HIGH, note);
}

export function undefinedAverageMetric(unit: string, note: string): LabelledMetric {
  return labelledMetric(null, unit, DataSourceLabel.ACTUAL, DataQuality.INSUFFICIENT, note);
}

export function carbonMetric(tradedKwh: number): LabelledMetric {
  const value = estimateCarbonSavingsKg(tradedKwh);
  if (tradedKwh <= 0) {
    return labelledMetric(
      0,
      "kg CO2e",
      DataSourceLabel.ESTIMATED,
      DataQuality.LOW,
      `Estimated from 0 kWh confirmed volume using ${ESTIMATED_GRID_KG_CO2_PER_KWH} kg CO2e/kWh grid factor.`,
    );
  }
  return labelledMetric(
    value,
    "kg CO2e",
    DataSourceLabel.ESTIMATED,
    DataQuality.MEDIUM,
    `Estimated as confirmed kWh × ${ESTIMATED_GRID_KG_CO2_PER_KWH} kg CO2e/kWh. Not measured at a meter.`,
  );
}


