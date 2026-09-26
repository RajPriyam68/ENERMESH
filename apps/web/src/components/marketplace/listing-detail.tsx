"use client";

import type { ListingPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AdvisorPanel } from "@/components/ai/advisor-panel";
import { PlaceBidForm } from "@/components/bids/place-bid-form";
import { PublishListingOnChain } from "@/components/trades/publish-listing-on-chain";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { formatKwh, formatPrice, formatWindow } from "@/lib/utils";

export function ListingDetail({ listingId }: { listingId: string }) {
  const user = useAuthStore((state) => state.user);
  const query = useQuery({
    queryKey: ["listing", listingId],
    queryFn: () => apiRequest<{ listing: ListingPublic }>(`/listings/${listingId}`),
  });

  if (query.isLoading) {
    return <Spinner label="Loading listing" />;
  }

  if (query.isError) {
    const message = query.error instanceof ApiError ? query.error.message : "Unable to load this listing.";
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="space-y-4">
        <Alert tone="error" role="alert" title={missing ? "Listing not found" : "Could not load listing"}>
          {message}
        </Alert>
        <Button variant="outline" asChild>
          <Link href="/marketplace">Back to marketplace</Link>
        </Button>
      </div>
    );
  }

  const listing = query.data?.listing;
  if (!listing) {
    return (
      <Alert tone="info">
        This listing is no longer available.
      </Alert>
    );
  }

  const owned = user?.id === listing.sellerId;

  return (
    <article className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted">{listing.energyType}</p>
        <h1 className="mt-1 text-3xl font-semibold">{listing.location}</h1>
        <p className="mt-1 text-muted">{listing.marketZone}</p>
      </div>

      <dl className="grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Price</dt>
          <dd className="mt-1 text-lg font-medium">{formatPrice(listing.pricePerKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Status</dt>
          <dd className="mt-1">{listing.status.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Original</dt>
          <dd className="mt-1">{formatKwh(listing.originalQuantityKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Available</dt>
          <dd className="mt-1">{formatKwh(listing.availableQuantityKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Sold</dt>
          <dd className="mt-1">{formatKwh(listing.soldQuantityKwh)} (actual)</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Trade size</dt>
          <dd className="mt-1">
            {formatKwh(listing.minTradeKwh)} – {formatKwh(listing.maxTradeKwh)}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Window</dt>
          <dd className="mt-1">{formatWindow(listing.availableFrom, listing.availableUntil)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-muted">Seller</dt>
          <dd className="mt-1">{listing.sellerDisplayName}</dd>
        </div>
      </dl>

      <Alert tone="info">
        Quantity shown here is live remaining energy, not a forecast. A bid may match only part of this offer.
      </Alert>

      {user ? (
        <AdvisorPanel
          listingId={listing.id}
          energyType={listing.energyType}
          marketZone={listing.marketZone}
          heading="Explain this listing"
        />
      ) : null}

      {owned ? (
        <div className="space-y-4">
          <Button asChild>
            <Link href={`/offers/${listing.id}/edit`}>Edit offer</Link>
          </Button>
          <PublishListingOnChain listing={listing} />
        </div>
      ) : (
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">Place a bid</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Matching uses the seller ask price if it is at or below your max. On-chain purchase happens from Matches after a fill.
          </p>
          <PlaceBidForm listing={listing} />
        </section>
      )}

      <Button variant="outline" asChild>
        <Link href="/marketplace">All offers</Link>
      </Button>
    </article>
  );
}
