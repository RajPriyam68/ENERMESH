"use client";

import type { EnergyType, PriceRecommendation } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toPriceSearchParams } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";

export function PriceRecommendationPanel({
  energyType,
  marketZone,
  availableFrom,
  availableUntil,
  onApply,
  applyLabel = "Use recommended price",
}: {
  energyType?: EnergyType;
  marketZone?: string;
  availableFrom?: string;
  availableUntil?: string;
  onApply?: (price: number) => void;
  applyLabel?: string;
}) {
  const token = useAuthStore((state) => state.accessToken);
  const status = useAuthStore((state) => state.status);
  const query = { energyType, marketZone, availableFrom, availableUntil };

  const recQuery = useQuery({
    queryKey: ["pricing", query],
    enabled: status === "authenticated" && Boolean(token),
    queryFn: async () => {
      const data = await apiRequest<{ recommendation: PriceRecommendation }>(
        `/pricing/recommendation${toPriceSearchParams(query)}`,
        { token },
      );
      return data.recommendation;
    },
  });

  if (status !== "authenticated") {
    return (
      <Alert tone="info">
        Sign in to load an advisory price from live offers, bids, and confirmed trades.
      </Alert>
    );
  }

  if (recQuery.isLoading) return <Spinner label="Loading price recommendation" />;

  if (recQuery.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load price recommendation">
        {recQuery.error instanceof ApiError ? recQuery.error.message : "Please retry."}
      </Alert>
    );
  }

  const rec = recQuery.data;
  if (!rec) return null;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Advisory price</p>
          <p className="mt-1 text-lg font-semibold">
            {rec.recommendedPrice === null ? "No suggestion" : formatPrice(rec.recommendedPrice)}
          </p>
        </div>
        <p className="text-xs text-muted">
          {rec.sourceLabel} · {rec.dataQuality} · confidence {Math.round(rec.confidence * 100)}%
        </p>
      </div>
      <p className="text-sm text-muted">{rec.reason}</p>
      <p className="text-xs text-muted">
        Range {rec.range.min === null ? "—" : formatPrice(rec.range.min)} to{" "}
        {rec.range.max === null ? "—" : formatPrice(rec.range.max)}. Samples: {rec.sampleCounts.trades} trades,{" "}
        {rec.sampleCounts.asks} offers, {rec.sampleCounts.bids} bids.
      </p>
      {onApply && rec.recommendedPrice !== null ? (
        <Button type="button" variant="outline" size="sm" onClick={() => onApply(rec.recommendedPrice!)}>
          {applyLabel}
        </Button>
      ) : null}
    </div>
  );
}
