import type { ListingFilter, ListingPublic } from "@enermesh/shared";
import { apiRequest } from "./api";

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

export type OnChainListingAction = "confirm" | "reject";

const LISTING_IDEMPOTENCY_KEY = "enermesh.s12.listingIdempotency";

function readIdempotencyMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LISTING_IDEMPOTENCY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeIdempotencyMap(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LISTING_IDEMPOTENCY_KEY, JSON.stringify(value));
}

export function listingIdempotencyKey(listingId: string, action: OnChainListingAction): string {
  const slot = `${listingId}:${action}`;
  const current = readIdempotencyMap();
  if (current[slot]) return current[slot];
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `idem-${listingId}-${action}-${Date.now()}`;
  current[slot] = generated;
  writeIdempotencyMap(current);
  return generated;
}

export function rotateListingIdempotencyKey(listingId: string, action: OnChainListingAction): string {
  const slot = `${listingId}:${action}`;
  const current = readIdempotencyMap();
  delete current[slot];
  writeIdempotencyMap(current);
  return listingIdempotencyKey(listingId, action);
}

export async function reportOnChainListing(
  token: string | null,
  listingId: string,
  input: { action: OnChainListingAction; txHash?: string },
): Promise<ListingPublic> {
  const body = {
    action: input.action,
    idempotencyKey: listingIdempotencyKey(listingId, input.action),
    ...(input.txHash ? { txHash: input.txHash } : {}),
  };
  const result = await apiRequest<{ listing: ListingPublic }>(`/listings/${listingId}/on-chain`, {
    method: "POST",
    token,
    body,
  });
  return result.listing;
}
