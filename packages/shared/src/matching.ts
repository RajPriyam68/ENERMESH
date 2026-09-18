import { EnergyType } from "./enums.js";
import { roundKwh } from "./quantity.js";

export interface MatchCandidateListing {
  id: string;
  sellerId: string;
  energyType: EnergyType;
  availableQuantityKwh: number;
  minTradeKwh: number;
  maxTradeKwh: number;
  pricePerKwh: number;
  marketZone: string;
  availableFrom: Date;
  availableUntil: Date;
  createdAt: Date;
}

export interface MatchCandidateBid {
  id: string;
  buyerId: string;
  unmatchedKwh: number;
  maxPricePerKwh: number;
  energyType: EnergyType;
  marketZone: string;
  requiredFrom: Date;
  requiredUntil: Date;
  createdAt: Date;
}

export interface MatchResult {
  listingId: string;
  bidId: string;
  matchedKwh: number;
  pricePerKwh: number;
  remainingListingKwh: number;
  remainingBidKwh: number;
}

function intervalsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function isCompatible(listing: MatchCandidateListing, bid: MatchCandidateBid): boolean {
  if (listing.availableQuantityKwh <= 0 || bid.unmatchedKwh <= 0) return false;
  if (listing.pricePerKwh > bid.maxPricePerKwh) return false;
  if (listing.energyType !== bid.energyType) return false;
  if (listing.marketZone !== bid.marketZone) return false;
  if (listing.sellerId === bid.buyerId) return false;
  return intervalsOverlap(
    listing.availableFrom,
    listing.availableUntil,
    bid.requiredFrom,
    bid.requiredUntil,
  );
}

/**
 * Deterministic matching: price (seller ask, lower first) → type → zone →
 * availability overlap (already filtered) → best price → earliest valid order.
 * Partial matching is mandatory.
 */
export function computePartialMatch(
  listing: MatchCandidateListing,
  bid: MatchCandidateBid,
): MatchResult | null {
  if (!isCompatible(listing, bid)) return null;

  const tradeCap = Math.min(listing.maxTradeKwh, listing.availableQuantityKwh, bid.unmatchedKwh);
  if (tradeCap < listing.minTradeKwh && tradeCap < bid.unmatchedKwh) {
    if (listing.availableQuantityKwh < listing.minTradeKwh && bid.unmatchedKwh < listing.minTradeKwh) {
      return null;
    }
  }

  const matchedKwh = roundKwh(Math.min(listing.availableQuantityKwh, bid.unmatchedKwh, listing.maxTradeKwh));
  if (matchedKwh <= 0) return null;
  if (matchedKwh < listing.minTradeKwh && listing.availableQuantityKwh >= listing.minTradeKwh) {
    return null;
  }

  return {
    listingId: listing.id,
    bidId: bid.id,
    matchedKwh,
    pricePerKwh: listing.pricePerKwh,
    remainingListingKwh: roundKwh(listing.availableQuantityKwh - matchedKwh),
    remainingBidKwh: roundKwh(bid.unmatchedKwh - matchedKwh),
  };
}

export function matchBidAgainstListings(
  bid: MatchCandidateBid,
  listings: MatchCandidateListing[],
): MatchResult[] {
  const sorted = sortListingsForMatching(listings);
  const results: MatchResult[] = [];
  let unmatched = bid.unmatchedKwh;
  const working = sorted.map((listing) => ({ ...listing }));
  for (const listing of working) {
    if (unmatched <= 0) break;
    const result = computePartialMatch(listing, { ...bid, unmatchedKwh: unmatched });
    if (!result) continue;
    results.push(result);
    unmatched = result.remainingBidKwh;
    listing.availableQuantityKwh = result.remainingListingKwh;
  }
  return results;
}

export function sortListingsForMatching(listings: MatchCandidateListing[]): MatchCandidateListing[] {
  return [...listings].sort((a, b) => {
    if (a.pricePerKwh !== b.pricePerKwh) return a.pricePerKwh - b.pricePerKwh;
    if (a.energyType !== b.energyType) return a.energyType.localeCompare(b.energyType);
    if (a.marketZone !== b.marketZone) return a.marketZone.localeCompare(b.marketZone);
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export function sortBidsForMatching(bids: MatchCandidateBid[]): MatchCandidateBid[] {
  return [...bids].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}
