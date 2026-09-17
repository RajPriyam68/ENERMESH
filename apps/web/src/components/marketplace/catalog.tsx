"use client";

import { EnergyType, type ListingPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ListingCard } from "@/components/marketplace/listing-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toSearchParams, type ListingListResponse, type ListingQuery } from "@/lib/listings";
import { loginHref } from "@/lib/routes";

const ENERGY_TYPES = Object.values(EnergyType);

export function MarketplaceCatalog() {
  const user = useAuthStore((state) => state.user);
  const status = useAuthStore((state) => state.status);
  const [draft, setDraft] = useState<ListingQuery>({
    page: 1,
    pageSize: 12,
    sortBy: "createdAt",
    sortOrder: "desc",
  });
  const [applied, setApplied] = useState<ListingQuery>(draft);

  const queryKey = useMemo(() => ["listings", applied], [applied]);
  const listingsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await apiRequest<ListingListResponse>(`/listings${toSearchParams(applied)}`);
      return data;
    },
  });

  const listings: ListingPublic[] = listingsQuery.data?.listings ?? [];
  const meta = listingsQuery.data
    ? {
        page: listingsQuery.data.page,
        pageSize: listingsQuery.data.pageSize,
        total: listingsQuery.data.total,
        totalPages: listingsQuery.data.totalPages,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Marketplace</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Live surplus energy offers. Empty results stay empty — nothing is mocked or estimated.
          </p>
        </div>
        {status === "authenticated" && (user?.role === "SELLER" || user?.role === "ADMIN") ? (
          <Button asChild>
            <Link href="/offers/new">Publish offer</Link>
          </Button>
        ) : status !== "authenticated" ? (
          <Button variant="outline" asChild>
            <Link href={loginHref("/offers/new")}>Sign in to sell</Link>
          </Button>
        ) : null}
      </div>

      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, page: 1 });
        }}
      >
        <Field label="Energy type" htmlFor="energyType">
          <Select
            id="energyType"
            value={draft.energyType ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                energyType: (event.target.value || undefined) as ListingQuery["energyType"],
              }))
            }
          >
            <option value="">Any</option>
            {ENERGY_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Market zone" htmlFor="marketZone">
          <Input
            id="marketZone"
            value={draft.marketZone ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, marketZone: event.target.value || undefined }))}
          />
        </Field>
        <Field label="Min kWh" htmlFor="minKwh">
          <Input
            id="minKwh"
            type="number"
            min="0"
            step="0.001"
            value={draft.minKwh ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, minKwh: event.target.value ? Number(event.target.value) : undefined }))
            }
          />
        </Field>
        <Field label="Max price" htmlFor="maxPrice">
          <Input
            id="maxPrice"
            type="number"
            min="0"
            step="0.0001"
            value={draft.maxPrice ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                maxPrice: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
          />
        </Field>
        <Field label="Search location" htmlFor="q">
          <Input
            id="q"
            value={draft.q ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value || undefined }))}
          />
        </Field>
        <Field label="Sort by" htmlFor="sortBy">
          <Select
            id="sortBy"
            value={draft.sortBy ?? "createdAt"}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sortBy: event.target.value as ListingQuery["sortBy"] }))
            }
          >
            <option value="createdAt">Newest</option>
            <option value="pricePerKwh">Price</option>
            <option value="availableQuantityKwh">Available kWh</option>
            <option value="availableFrom">Window start</option>
          </Select>
        </Field>
        <Field label="Order" htmlFor="sortOrder">
          <Select
            id="sortOrder"
            value={draft.sortOrder ?? "desc"}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sortOrder: event.target.value as "asc" | "desc" }))
            }
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const reset: ListingQuery = { page: 1, pageSize: 12, sortBy: "createdAt", sortOrder: "desc" };
              setDraft(reset);
              setApplied(reset);
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {listingsQuery.isLoading ? <Spinner label="Loading listings" /> : null}

      {listingsQuery.isError ? (
        <Alert tone="error" role="alert" title="Could not load listings">
          {listingsQuery.error instanceof ApiError ? listingsQuery.error.message : "Please retry."}
        </Alert>
      ) : null}

      {!listingsQuery.isLoading && !listingsQuery.isError && listings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No active listings</p>
          <p className="mt-2 text-sm text-muted">
            There are no live offers matching these filters. This empty state is actual, not a sample catalog.
          </p>
        </div>
      ) : null}

      {listings.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : null}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted">
            Page {meta.page} of {meta.totalPages} · {meta.total} offers
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => setApplied((current) => ({ ...current, page: (current.page ?? 1) - 1 }))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setApplied((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
