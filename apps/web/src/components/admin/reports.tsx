"use client";

import type { EnergyType } from "@enermesh/shared";
import { EnergyType as EnergyTypeEnum } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { MetricCard } from "@/components/analytics/metric-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import {
  toReportParams,
  type MarketplaceReportResponse,
  type ReportClientQuery,
  type SettlementReportResponse,
  type TelemetryReportResponse,
} from "@/lib/admin";

const ENERGY_TYPES = Object.values(EnergyTypeEnum);

export function AdminReports() {
  const token = useAuthStore((state) => state.accessToken);
  const [draft, setDraft] = useState<{ energyType?: EnergyType; marketZone: string }>({ marketZone: "" });
  const [applied, setApplied] = useState<ReportClientQuery>({});
  const params = toReportParams(applied);

  const marketplaceQuery = useQuery({
    queryKey: ["reports", "marketplace", applied],
    enabled: Boolean(token),
    queryFn: async () =>
      apiRequest<MarketplaceReportResponse>(`/reports/marketplace${params}`, { token }),
  });
  const settlementQuery = useQuery({
    queryKey: ["reports", "settlement", applied],
    enabled: Boolean(token),
    queryFn: async () => apiRequest<SettlementReportResponse>(`/reports/settlement${params}`, { token }),
  });
  const telemetryQuery = useQuery({
    queryKey: ["reports", "telemetry", applied],
    enabled: Boolean(token),
    queryFn: async () => apiRequest<TelemetryReportResponse>(`/reports/telemetry${params}`, { token }),
  });

  const marketplace = marketplaceQuery.data?.report;
  const settlement = settlementQuery.data?.report;
  const telemetry = telemetryQuery.data?.report;
  const loading = marketplaceQuery.isLoading || settlementQuery.isLoading || telemetryQuery.isLoading;
  const error = marketplaceQuery.error ?? settlementQuery.error ?? telemetryQuery.error;

  return (
    <div className="space-y-6">
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({
            energyType: draft.energyType,
            marketZone: draft.marketZone.trim() || undefined,
          });
        }}
      >
        <Field label="Energy type" htmlFor="reportEnergyType">
          <Select
            id="reportEnergyType"
            value={draft.energyType ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                energyType: (event.target.value || undefined) as EnergyType | undefined,
              }))
            }
          >
            <option value="">All types</option>
            {ENERGY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Market zone" htmlFor="reportZone">
          <Input
            id="reportZone"
            value={draft.marketZone}
            onChange={(event) => setDraft((current) => ({ ...current, marketZone: event.target.value }))}
          />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({ marketZone: "" });
              setApplied({});
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {loading ? <Spinner label="Loading reports" /> : null}
      {error ? (
        <Alert tone="error" role="alert" title="Could not load reports">
          {error instanceof ApiError ? error.message : "Please retry."}
        </Alert>
      ) : null}

      {marketplace ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Marketplace</h2>
          <p className="text-sm text-muted">
            Confirmed volume only. Empty books stay at actual 0. Carbon savings remain estimated.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Energy traded" metric={marketplace.analytics.energyTradedKwh} />
            <MetricCard title="Transaction value" metric={marketplace.analytics.transactionValue} />
            <MetricCard title="Live supply" metric={marketplace.analytics.supplyKwh} />
            <MetricCard title="Live demand" metric={marketplace.analytics.demandKwh} />
          </div>
          <p className="text-sm text-muted">
            Rows: {marketplace.counts.listings} listings, {marketplace.counts.bids} bids, {marketplace.counts.matches}{" "}
            matches, {marketplace.counts.confirmedTrades} confirmed trades.
          </p>
        </section>
      ) : null}

      {settlement ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Settlement</h2>
          <p className="text-sm text-muted">Counts come from Trade rows. Wallet UI receipts never invent CONFIRMED.</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Confirmed energy" metric={settlement.analytics.energyTradedKwh} />
            <MetricCard title="Confirmed value" metric={settlement.analytics.transactionValue} />
            <MetricCard title="Est. carbon savings" metric={settlement.analytics.estimatedCarbonSavingsKg} />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-card text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-3 py-2">Trade status</th>
                  <th className="px-3 py-2">Count</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(settlement.tradeStatusCounts).map(([status, count]) => (
                  <tr key={status} className="border-t border-border">
                    <td className="px-3 py-2">{status}</td>
                    <td className="px-3 py-2">{count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {telemetry ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Telemetry</h2>
          <p className="text-sm text-muted">
            EnergyHistory samples only. Simulated kWh is not marketplace volume and does not confirm trades.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Sampled kWh" metric={telemetry.totalKwh} />
          </div>
          {telemetry.sampleCount === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <p className="font-medium">No telemetry samples</p>
              <p className="mt-2 text-sm text-muted">Empty history stays at actual 0 kWh.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-sm">
                <thead className="bg-card text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Samples</th>
                    <th className="px-3 py-2">kWh</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(telemetry.bySourceLabel).map(([label, row]) => (
                    <tr key={label} className="border-t border-border">
                      <td className="px-3 py-2">{label}</td>
                      <td className="px-3 py-2">{row.sampleCount}</td>
                      <td className="px-3 py-2">{row.totalKwh}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
