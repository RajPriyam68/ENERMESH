import type { ListingFilter, ListingPublic } from "@enermesh/shared";

export interface ListingListResponse {
  listings: ListingPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ListingListMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ListingQuery = Partial<
  Pick<
    ListingFilter,
    | "page"
    | "pageSize"
    | "sortBy"
    | "sortOrder"
    | "energyType"
    | "marketZone"
    | "minPrice"
    | "maxPrice"
    | "minKwh"
    | "q"
    | "status"
  >
>;

export function toSearchParams(query: ListingQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}
