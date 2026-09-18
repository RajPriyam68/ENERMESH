"use client";

import type { BidPublic, MatchPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatKwh, formatPrice, formatWindow } from "@/lib/utils";

interface MatchListResponse {
  matches: MatchPublic[];
}

export function BidDetail({ bidId }: { bidId: string }) {
  const token = useAuthStore((state) => state.accessToken);
  const bidQuery = useQuery({
    queryKey: ["bid", bidId],
    enabled: Boolean(token),
    queryFn: () => apiRequest<{ bid: BidPublic }>(`/bids/${bidId}`, { token }),
  });
  const matchesQuery = useQuery({
    queryKey: ["matches", { bidId }],
    enabled: Boolean(token),
    queryFn: () => apiRequest<MatchListResponse>(`/matches?bidId=${bidId}&pageSize=50`, { token }),
  });

  if (bidQuery.isLoading) return <Spinner label="Loading bid" />;
  if (bidQuery.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load bid">
        {bidQuery.error instanceof ApiError ? bidQuery.error.message : "Please retry."}
      </Alert>
    );
  }

  const bid = bidQuery.data?.bid;
  if (!bid) return <Alert tone="info">This bid is no longer available.</Alert>;

  const matches = matchesQuery.data?.matches ?? [];

  return (
    <article className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{bid.energyType}</p>
        <h1 className="mt-1 text-3xl font-semibold">{bid.marketZone}</h1>
        <p className="mt-1 text-muted">{bid.status.replaceAll("_", " ")}</p>
      </div>
      <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Requested</dt>
          <dd className="mt-1">{formatKwh(bid.requestedKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Matched</dt>
          <dd className="mt-1">{formatKwh(bid.matchedKwh)} (actual)</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Unmatched</dt>
          <dd className="mt-1">{formatKwh(bid.unmatchedKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Max price</dt>
          <dd className="mt-1">{formatPrice(bid.maxPricePerKwh)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs uppercase tracking-wide text-muted">Window</dt>
          <dd className="mt-1">{formatWindow(bid.requiredFrom, bid.requiredUntil)}</dd>
        </div>
      </dl>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Matches</h2>
        {matchesQuery.isLoading ? <Spinner label="Loading matches" /> : null}
        {!matchesQuery.isLoading && matches.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-sm text-muted">
            No matches yet. Remaining demand stays unmatched until a compatible listing appears.
          </div>
        ) : null}
        {matches.map((match) => (
          <div key={match.id} className="rounded-lg border border-border bg-card p-4">
            <p className="font-medium">{match.listingLocation}</p>
            <p className="text-sm">
              {formatKwh(match.matchedKwh)} at {formatPrice(match.pricePerKwh)}
            </p>
            <p className="text-xs text-muted">{match.status.replaceAll("_", " ")} · settlement is Sprint 4+</p>
            <Link href={`/marketplace/${match.listingId}`} className="mt-2 inline-block text-sm text-primary hover:underline">
              View listing
            </Link>
          </div>
        ))}
      </section>

      <Button variant="outline" asChild>
        <Link href="/bids">All bids</Link>
      </Button>
    </article>
  );
}
