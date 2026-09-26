import type {
  DataSourceLabel,
  EnergyHistoryPublic,
  EnergyHistorySummary,
  EnergyType,
  IotStatus,
} from "@enermesh/shared";

export interface EnergyHistoryResponse {
  samples: EnergyHistoryPublic[];
  summary: EnergyHistorySummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface IotStatusResponse {
  status: IotStatus;
}

export interface IngestEnergyBody {
  kwh: number;
  recordedAt?: string;
  deviceId?: string;
  sourceLabel?: DataSourceLabel;
  energyType?: EnergyType;
}

export interface SimulateEnergyBody {
  kwh: number;
  samples?: number;
  intervalMinutes?: number;
  deviceId?: string;
  energyType?: EnergyType;
}

export interface EnergyHistoryQuery {
  page?: number;
  pageSize?: number;
  sourceLabel?: DataSourceLabel;
  deviceId?: string;
}

export function toEnergyHistoryParams(query: EnergyHistoryQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function sourceLabelTone(label: DataSourceLabel): "info" | "warning" | "success" {
  if (label === "SIMULATED") return "warning";
  if (label === "ESTIMATED") return "info";
  return "success";
}
