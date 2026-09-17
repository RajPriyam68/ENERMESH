"use client";

import type { ListingPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { OfferForm } from "@/components/offers/offer-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export function EditOffer({ listingId }: { listingId: string }) {
  const user = useAuthStore((state) => state.user);
  const query = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => apiRequest<{ listing: ListingPublic }>(`/listings/${listingId}`),
  });

  if (query.isLoading) return <Spinner label="Loading offer" />;

  if (query.isError) {
    return (
      <div className="space-y-4">
        <Alert tone="error" role="alert" title="Could not load offer">
          {query.error instanceof ApiError ? query.error.message : "Please retry."}
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/offers">Back to my offers</Link>
        </Button>
      </div>
    );
  }

  const listing = query.data?.listing;
  if (!listing) {
    return <Alert tone="info">This listing is no longer available.</Alert>;
  }

  if (user && listing.sellerId !== user.id && user.role !== "ADMIN") {
    return (
      <Alert tone="error" role="alert" title="Not your offer">
        You can only edit listings you published.
      </Alert>
    );
  }

  if (listing.status !== "ACTIVE" && listing.status !== "PARTIALLY_FILLED") {
    return (
      <div className="space-y-4">
        <Alert tone="info" title="This offer cannot be edited">
          Status is {listing.status.replaceAll("_", " ")}. Only active or partially filled offers can change.
        </Alert>
        <Button variant="outline" asChild>
          <Link href={`/marketplace/${listing.id}`}>View listing</Link>
        </Button>
      </div>
    );
  }

  return <OfferForm listing={listing} />;
}
