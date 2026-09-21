"use client";

import type { ListingPublic } from "@enermesh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { PublishListingOnChain } from "@/components/trades/publish-listing-on-chain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import type { ListingListResponse } from "@/lib/listings";
import { formatKwh, formatPrice, formatWindow } from "@/lib/utils";

function canEdit(status: ListingPublic["status"]): boolean {
  return status === "ACTIVE" || status === "PARTIALLY_FILLED";
}

export function SellerOffers() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["listings", "mine"],
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<ListingListResponse>("/listings/mine?pageSize=50&sortBy=createdAt&sortOrder=desc", { token }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ listing: ListingPublic }>(`/listings/${id}/cancel`, { method: "POST", token }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : "Unable to cancel this offer.");
    },
  });

  if (query.isLoading) return <Spinner label="Loading your offers" />;

  if (query.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load offers">
        {query.error instanceof ApiError ? query.error.message : "Please retry."}
      </Alert>
    );
  }

  const listings = query.data?.listings ?? [];

  return (
    <div className="space-y-4">
      {actionError ? (
        <Alert tone="error" role="alert" title="Cancel failed">
          {actionError}
        </Alert>
      ) : null}

      {listings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No offers yet</p>
          <p className="mt-2 text-sm text-muted">
            You have not published surplus energy. This list stays empty until you create a real listing.
          </p>
          <Button className="mt-4" asChild>
            <Link href="/offers/new">Publish offer</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => (
            <li key={listing.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted">
                    {listing.energyType} · {listing.status.replaceAll("_", " ")}
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">{listing.location}</h2>
                  <p className="text-sm text-muted">{listing.marketZone}</p>
                </div>
                <p className="text-sm font-medium">{formatPrice(listing.pricePerKwh)}</p>
              </div>
              <p className="mt-2 text-sm">
                {formatKwh(listing.availableQuantityKwh)} remaining · {formatKwh(listing.soldQuantityKwh)} sold
              </p>
              <p className="text-xs text-muted">{formatWindow(listing.availableFrom, listing.availableUntil)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/marketplace/${listing.id}`}>View</Link>
                </Button>
                {canEdit(listing.status) ? (
                  <>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/offers/${listing.id}/edit`}>Edit</Link>
                    </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={cancelMutation.isPending}
                        onClick={() => {
                          if (window.confirm("Cancel this offer? Remaining energy will no longer be listed.")) {
                            cancelMutation.mutate(listing.id);
                          }
                        }}
                      >
                        Cancel offer
                      </Button>
                    </>
                  ) : null}
                </div>
                <PublishListingOnChain listing={listing} />
              </li>
          ))}
        </ul>
      )}
    </div>
  );
}
