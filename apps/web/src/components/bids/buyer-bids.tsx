"use client";

import type { BidPublic } from "@enermesh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatKwh, formatPrice, formatWindow } from "@/lib/utils";

interface BidListResponse {
  bids: BidPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function BuyerBids() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["bids", "mine"],
    enabled: Boolean(token),
    queryFn: () => apiRequest<BidListResponse>("/bids?pageSize=50&sortBy=createdAt&sortOrder=desc", { token }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiRequest<{ bid: BidPublic }>(`/bids/${id}/cancel`, { method: "POST", token }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["bids"] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : "Unable to cancel this bid.");
    },
  });

  if (query.isLoading) return <Spinner label="Loading your bids" />;
  if (query.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load bids">
        {query.error instanceof ApiError ? query.error.message : "Please retry."}
      </Alert>
    );
  }

  const bids = query.data?.bids ?? [];

  return (
    <div className="space-y-4">
      {actionError ? (
        <Alert tone="error" role="alert" title="Cancel failed">
          {actionError}
        </Alert>
      ) : null}
      {bids.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No bids yet</p>
          <p className="mt-2 text-sm text-muted">
            You have not requested energy. This list stays empty until you place a real bid.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/marketplace">Browse marketplace</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {bids.map((bid) => (
            <li key={bid.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                {bid.energyType} · {bid.status.replaceAll("_", " ")}
              </p>
              <p className="mt-1 font-medium">{bid.marketZone}</p>
              <p className="mt-1 text-sm">
                {formatKwh(bid.matchedKwh)} matched · {formatKwh(bid.unmatchedKwh)} unmatched of {formatKwh(bid.requestedKwh)}
              </p>
              <p className="text-sm">{formatPrice(bid.maxPricePerKwh)} max</p>
              <p className="text-xs text-muted">{formatWindow(bid.requiredFrom, bid.requiredUntil)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/bids/${bid.id}`}>View</Link>
                </Button>
                {bid.status === "OPEN" || bid.status === "PARTIALLY_MATCHED" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={cancelMutation.isPending}
                    onClick={() => {
                      if (window.confirm("Cancel remaining unmatched demand on this bid?")) {
                        cancelMutation.mutate(bid.id);
                      }
                    }}
                  >
                    Cancel bid
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
