"use client";

import type { ListingPublic } from "@enermesh/shared";
import Link from "next/link";
import { formatKwh, formatPrice, formatWindow } from "@/lib/utils";

export function ListingCard({ listing }: { listing: ListingPublic }) {
  return (
    <article className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">{listing.energyType}</p>
          <h2 className="mt-1 text-lg font-semibold">{listing.location}</h2>
          <p className="text-sm text-muted">{listing.marketZone}</p>
        </div>
        <p className="text-right text-sm font-medium">{formatPrice(listing.pricePerKwh)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">Available</dt>
          <dd>{formatKwh(listing.availableQuantityKwh)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Trade size</dt>
          <dd>
            {formatKwh(listing.minTradeKwh)} – {formatKwh(listing.maxTradeKwh)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-muted">Window</dt>
          <dd>{formatWindow(listing.availableFrom, listing.availableUntil)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-xs text-muted">
        {listing.sellerDisplayName} · {listing.status.replaceAll("_", " ")}
      </p>
      <Link href={`/marketplace/${listing.id}`} className="mt-3 text-sm font-medium text-primary hover:underline">
        View offer
      </Link>
    </article>
  );
}
