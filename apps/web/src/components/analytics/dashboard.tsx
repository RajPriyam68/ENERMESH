"use client";

import type { AnalyticsSnapshot, EnergyType } from "@enermesh/shared";
import { EnergyType as EnergyTypeEnum } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MetricCard } from "@/components/analytics/metric-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

const ENERGY_TYPES = Object.values(EnergyTypeEnum);

function toParams(query: { energyType?: EnergyType; marketZone?: string }): string {
  const params = new URLSearchParams();
  if (query.energyType) params.set("energyType", query.energyType);
  if (query.marketZone) params.set("marketZone", query.marketZone);
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function AnalyticsDashboard() {
  const token = useAuthStore((state) => state.accessToken);
  const [draft, setDraft] = useState<{ energyType?: EnergyType; marketZone: string }>({ marketZone: "" });
  const [applied, setApplied] = useState<{ energyType?: EnergyType; marketZone?: string }>({});

  const analyticsQuery = useQuery({
    queryKey: ["analytics", applied],
    enabled: Boolean(token),
    queryFn: async () => {
      const data = await apiRequest<{ analytics: AnalyticsSnapshot }>(`/analytics${toParams(applied)}`, { token });
      return data.analytics;
    },
  });

  const analytics = analyticsQuery.data;
  const chartData = useMemo(
    () =>
      (analytics?.series ?? []).map((point) => ({
        date: point.date,
        kWh: point.energyTradedKwh,
        value: point.transactionValue,
      })),
    [analytics],
  );
  const typeData = useMemo(
    () =>
      (analytics?.byEnergyType ?? []).map((row) => ({
        name: row.key,
        kWh: row.energyTradedKwh,
      })),
    [analytics],
  );

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
        <Field label="Energy type" htmlFor="dashEnergyType">
          <Select
            id="dashEnergyType"
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
        <Field label="Market zone" htmlFor="dashZone">
          <Input
            id="dashZone"
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

      {analyticsQuery.isLoading ? <Spinner label="Loading analytics" /> : null}
      {analyticsQuery.isError ? (
        <Alert tone="error" role="alert" title="Could not load analytics">
          {analyticsQuery.error instanceof ApiError ? analyticsQuery.error.message : "Please retry."}
        </Alert>
      ) : null}

      {analytics ? (
        <>
          <p className="text-sm text-muted">
            Scope: {analytics.scope === "platform" ? "platform (admin)" : "your account"}. Carbon savings are
            estimated; every other card is labelled from live marketplace rows.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Energy traded" metric={analytics.energyTradedKwh} />
            <MetricCard title="Transaction value" metric={analytics.transactionValue} />
            <MetricCard title="Average price" metric={analytics.averagePricePerKwh} />
            <MetricCard title="Live supply" metric={analytics.supplyKwh} />
            <MetricCard title="Live demand" metric={analytics.demandKwh} />
            <MetricCard title="Matched" metric={analytics.matchedKwh} />
            <MetricCard title="Unmatched demand" metric={analytics.unmatchedKwh} />
            <MetricCard title="Revenue" metric={analytics.revenue} />
            <MetricCard title="Spending" metric={analytics.spending} />
            <MetricCard title="Renewable share" metric={analytics.renewableShare} />
            <MetricCard title="Est. carbon savings" metric={analytics.estimatedCarbonSavingsKg} />
          </div>

          {chartData.length === 0 && typeData.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
              <p className="font-medium">No confirmed volume</p>
              <p className="mt-2 text-sm text-muted">
                Charts stay empty until verified trades exist. This empty state is actual, not a sample dashboard.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {chartData.length > 0 ? (
                <div className="h-72 rounded-lg border border-border bg-card p-4">
                  <p className="mb-2 text-sm font-medium">Confirmed energy over time (actual)</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="kWh" stroke="#0f6b4c" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              {typeData.length > 0 ? (
                <div className="h-72 rounded-lg border border-border bg-card p-4">
                  <p className="mb-2 text-sm font-medium">Confirmed kWh by energy type (actual)</p>
                  <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={typeData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="kWh" fill="#148f68" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
