import type { EnergyType, PriceRecommendation } from "@enermesh/shared";

export interface PriceQuery {
  energyType?: EnergyType;
  marketZone?: string;
  availableFrom?: string;
  availableUntil?: string;
}

export function toPriceSearchParams(query: PriceQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function applyRecommendedPrice(recommendation: PriceRecommendation): number | null {
  return recommendation.advisory ? recommendation.recommendedPrice : null;
}
