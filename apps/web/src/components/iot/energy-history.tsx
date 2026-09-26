"use client";

import type { DataSourceLabel, EnergyType } from "@enermesh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  toEnergyHistoryParams,
  type EnergyHistoryResponse,
  type IngestEnergyBody,
  type IotStatusResponse,
  type SimulateEnergyBody,
} from "@/lib/iot";

const SOURCE_LABELS: DataSourceLabel[] = ["ACTUAL", "ESTIMATED", "SIMULATED"];
const ENERGY_TYPES: EnergyType[] = ["SOLAR", "WIND", "HYDRO", "BIOMASS", "MIXED_RENEWABLE"];

function formatKwh(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} kWh`;
}

export function EnergyHistoryPanel() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [ingest, setIngest] = useState<{ kwh: string; deviceId: string; sourceLabel: DataSourceLabel; energyType: string }>({
    kwh: "",
    deviceId: "",
    sourceLabel: "ACTUAL",
    energyType: "",
  });
  const [simulate, setSimulate] = useState({ kwh: "1", samples: "4", intervalMinutes: "60", deviceId: "sim-meter" });
  const [filter, setFilter] = useState<{ sourceLabel: string; deviceId: string }>({ sourceLabel: "", deviceId: "" });
  const [applied, setApplied] = useState<{ sourceLabel?: DataSourceLabel; deviceId?: string }>({});

  const statusQuery = useQuery({
    queryKey: ["iot", "status"],
    enabled: Boolean(token),
    queryFn: async () => {
      const data = await apiRequest<IotStatusResponse>("/iot/status", { token });
      return data.status;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["iot", "history", applied],
    enabled: Boolean(token),
    queryFn: async () => {
      return apiRequest<EnergyHistoryResponse>(`/iot/history${toEnergyHistoryParams({ pageSize: 50, ...applied })}`, {
        token,
      });
    },
  });

  const ingestMutation = useMutation({
    mutationFn: async (body: IngestEnergyBody) => {
      return apiRequest<{ sample: EnergyHistoryResponse["samples"][number] }>("/iot/readings", {
        method: "POST",
        token,
        body,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["iot"] });
    },
  });

  const simulateMutation = useMutation({
    mutationFn: async (body: SimulateEnergyBody) => {
      return apiRequest<EnergyHistoryResponse>("/iot/simulate", { method: "POST", token, body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["iot"] });
    },
  });

  const summary = historyQuery.data?.summary;
  const samples = historyQuery.data?.samples ?? [];

  return (
    <div className="space-y-6">
      {statusQuery.isLoading ? <Spinner label="Checking IoT adapters" /> : null}
      {statusQuery.data ? (
        <Alert tone="info">
          HTTP ingest and labelled simulation are available. MQTT is{" "}
          {statusQuery.data.mqttConfigured ? "configured but not connected" : "unconfigured"}. Telemetry never writes
          listings, bids, or settlement.
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Samples</p>
          <p className="mt-1 text-xl font-semibold">{summary?.sampleCount ?? 0}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Actual kWh</p>
          <p className="mt-1 text-xl font-semibold">{formatKwh(summary?.bySourceLabel.ACTUAL.totalKwh ?? 0)}</p>
        </article>
        <article className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">Simulated kWh</p>
          <p className="mt-1 text-xl font-semibold">{formatKwh(summary?.bySourceLabel.SIMULATED.totalKwh ?? 0)}</p>
        </article>
      </section>

      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({
            sourceLabel: (filter.sourceLabel || undefined) as DataSourceLabel | undefined,
            deviceId: filter.deviceId.trim() || undefined,
          });
        }}
      >
        <Field htmlFor="iot-filter-source" label="Source label">
          <Select
            id="iot-filter-source"
            value={filter.sourceLabel}
            onChange={(event) => setFilter((current) => ({ ...current, sourceLabel: event.target.value }))}
          >
            <option value="">All labels</option>
            {SOURCE_LABELS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field htmlFor="iot-filter-device" label="Device">
          <Input
            id="iot-filter-device"
            value={filter.deviceId}
            onChange={(event) => setFilter((current) => ({ ...current, deviceId: event.target.value }))}
            placeholder="meter-1"
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </div>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            const kwh = Number(ingest.kwh);
            ingestMutation.mutate({
              kwh,
              ...(ingest.deviceId.trim() ? { deviceId: ingest.deviceId.trim() } : {}),
              sourceLabel: ingest.sourceLabel,
              ...(ingest.energyType ? { energyType: ingest.energyType as EnergyType } : {}),
            });
          }}
        >
          <h2 className="text-lg font-semibold">Ingest reading</h2>
          <p className="text-xs text-muted">Stored as EnergyHistory. Does not create an offer or a trade.</p>
          <Field htmlFor="iot-kwh" label="kWh">
            <Input
              id="iot-kwh"
              type="number"
              min="0"
              step="0.001"
              required
              value={ingest.kwh}
              onChange={(event) => setIngest((current) => ({ ...current, kwh: event.target.value }))}
            />
          </Field>
          <Field htmlFor="iot-device" label="Device id">
            <Input
              id="iot-device"
              value={ingest.deviceId}
              onChange={(event) => setIngest((current) => ({ ...current, deviceId: event.target.value }))}
              placeholder="optional"
            />
          </Field>
          <Field htmlFor="iot-source" label="Source label">
            <Select
              id="iot-source"
              value={ingest.sourceLabel}
              onChange={(event) =>
                setIngest((current) => ({ ...current, sourceLabel: event.target.value as DataSourceLabel }))
              }
            >
              {SOURCE_LABELS.map((label) => (
                <option key={label} value={label}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="iot-type" label="Energy type">
            <Select
              id="iot-type"
              value={ingest.energyType}
              onChange={(event) => setIngest((current) => ({ ...current, energyType: event.target.value }))}
            >
              <option value="">Unspecified</option>
              {ENERGY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          {ingestMutation.isError ? (
            <Alert tone="error" role="alert">
              {ingestMutation.error instanceof ApiError ? ingestMutation.error.message : "Unable to ingest reading."}
            </Alert>
          ) : null}
          <Button type="submit" disabled={ingestMutation.isPending}>
            {ingestMutation.isPending ? "Saving…" : "Save reading"}
          </Button>
        </form>

        <form
          className="space-y-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            simulateMutation.mutate({
              kwh: Number(simulate.kwh),
              samples: Number(simulate.samples),
              intervalMinutes: Number(simulate.intervalMinutes),
              ...(simulate.deviceId.trim() ? { deviceId: simulate.deviceId.trim() } : {}),
            });
          }}
        >
          <h2 className="text-lg font-semibold">Simulate series</h2>
          <p className="text-xs text-muted">Every generated sample is labelled SIMULATED. Marketplace volume stays unchanged.</p>
          <Field htmlFor="sim-kwh" label="kWh per sample">
            <Input
              id="sim-kwh"
              type="number"
              min="0"
              step="0.001"
              required
              value={simulate.kwh}
              onChange={(event) => setSimulate((current) => ({ ...current, kwh: event.target.value }))}
            />
          </Field>
          <Field htmlFor="sim-samples" label="Samples">
            <Input
              id="sim-samples"
              type="number"
              min="1"
              max="24"
              required
              value={simulate.samples}
              onChange={(event) => setSimulate((current) => ({ ...current, samples: event.target.value }))}
            />
          </Field>
          <Field htmlFor="sim-interval" label="Interval (minutes)">
            <Input
              id="sim-interval"
              type="number"
              min="1"
              max="1440"
              required
              value={simulate.intervalMinutes}
              onChange={(event) => setSimulate((current) => ({ ...current, intervalMinutes: event.target.value }))}
            />
          </Field>
          <Field htmlFor="sim-device" label="Device id">
            <Input
              id="sim-device"
              value={simulate.deviceId}
              onChange={(event) => setSimulate((current) => ({ ...current, deviceId: event.target.value }))}
            />
          </Field>
          {simulateMutation.isError ? (
            <Alert tone="error" role="alert">
              {simulateMutation.error instanceof ApiError
                ? simulateMutation.error.message
                : "Unable to generate simulated samples."}
            </Alert>
          ) : null}
          <Button type="submit" variant="outline" disabled={simulateMutation.isPending}>
            {simulateMutation.isPending ? "Generating…" : "Generate SIMULATED samples"}
          </Button>
        </form>
      </div>

      {historyQuery.isLoading ? <Spinner label="Loading energy history" /> : null}
      {historyQuery.isError ? (
        <Alert tone="error" role="alert">
          {historyQuery.error instanceof ApiError ? historyQuery.error.message : "Unable to load energy history."}
        </Alert>
      ) : null}
      {!historyQuery.isLoading && samples.length === 0 ? (
        <Alert tone="info">No EnergyHistory rows yet. Empty telemetry stays at 0 kWh — nothing is invented.</Alert>
      ) : null}
      {samples.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Recorded</th>
                <th className="px-3 py-2">kWh</th>
                <th className="px-3 py-2">Label</th>
                <th className="px-3 py-2">Adapter</th>
                <th className="px-3 py-2">Device</th>
              </tr>
            </thead>
            <tbody>
              {samples.map((sample) => (
                <tr key={sample.id} className="border-t border-border">
                  <td className="px-3 py-2">{new Date(sample.recordedAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{sample.kwh}</td>
                  <td className="px-3 py-2">{sample.sourceLabel}</td>
                  <td className="px-3 py-2">{sample.adapter}</td>
                  <td className="px-3 py-2">{sample.deviceId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
