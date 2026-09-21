"use client";

import type { MatchPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ReviewTrade } from "@/components/trades/review-trade";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatKwh, formatPrice } from "@/lib/utils";

interface MatchListResponse {
  matches: MatchPublic[];
}

export function MatchList() {
  const token = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const query = useQuery({
    queryKey: ["matches", "mine"],
    enabled: Boolean(token),
    queryFn: () => apiRequest<MatchListResponse>("/matches?pageSize=50&sortBy=createdAt&sortOrder=desc", { token }),
  });

  if (query.isLoading) return <Spinner label="Loading matches" />;
  if (query.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load matches">
        {query.error instanceof ApiError ? query.error.message : "Please retry."}
      </Alert>
    );
  }

  const matches = query.data?.matches ?? [];
  if (matches.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="font-medium">No matches yet</p>
        <p className="mt-2 text-sm text-muted">
          Matches appear after a bid fills against live remaining energy. Nothing is simulated here.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {matches.map((match) => (
        <li key={match.id} className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wide text-muted">
            {match.energyType} · {match.status.replaceAll("_", " ")}
          </p>
          <p className="mt-1 font-medium">{match.listingLocation}</p>
          <p className="text-sm">
            {formatKwh(match.matchedKwh)} at {formatPrice(match.pricePerKwh)}
          </p>
          <p className="text-xs text-muted">{match.marketZone} · settlement stays unconfirmed until the API verifies a receipt</p>
          <Link href={`/marketplace/${match.listingId}`} className="mt-2 inline-block text-sm text-primary hover:underline">
            View listing
          </Link>
          {user?.id === match.buyerId ? <ReviewTrade match={match} action="purchase" /> : null}
          {user?.id === match.buyerId || user?.id === match.sellerId ? <ReviewTrade match={match} action="settle" /> : null}
        </li>
      ))}
    </ul>
  );
}
