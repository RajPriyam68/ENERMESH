import { DataQuality, DataSourceLabel, type EnergyType } from "./enums.js";
import { roundPrice } from "./quantity.js";
import type { PriceRecommendation } from "./types.js";

export const PRICE_KIND_WEIGHT = { trade: 3, ask: 1, bid: 1.2 } as const;
export const PRICE_RECENCY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;

export interface PriceObservation {
  pricePerKwh: number;
  quantityKwh: number;
  kind: "trade" | "ask" | "bid";
  energyType: EnergyType;
  marketZone: string;
  occurredAt: Date;
  windowFrom?: Date;
  windowUntil?: Date;
}

export interface PriceRecommendInput {
  observations: PriceObservation[];
  energyType?: EnergyType;
  marketZone?: string;
  windowFrom?: Date;
  windowUntil?: Date;
  now?: Date;
}

export type PriceRecommendResult = PriceRecommendation;

function recencyWeight(occurredAt: Date, now: Date): number {
  const age = Math.max(0, now.getTime() - occurredAt.getTime());
  return Math.exp((-Math.LN2 * age) / PRICE_RECENCY_HALF_LIFE_MS);
}

function typeWeight(observationType: EnergyType, filter?: EnergyType): number {
  if (!filter) return 1;
  return observationType === filter ? 1 : 0.25;
}

function zoneWeight(observationZone: string, filter?: string): number {
  if (!filter) return 1;
  return observationZone.trim().toLowerCase() === filter.trim().toLowerCase() ? 1 : 0.3;
}

function windowsOverlap(aFrom?: Date, aUntil?: Date, bFrom?: Date, bUntil?: Date): boolean {
  if (!aFrom || !aUntil || !bFrom || !bUntil) return true;
  return aFrom.getTime() < bUntil.getTime() && bFrom.getTime() < aUntil.getTime();
}

function windowWeight(observation: PriceObservation, input: PriceRecommendInput): number {
  if (!input.windowFrom || !input.windowUntil) return 1;
  return windowsOverlap(observation.windowFrom, observation.windowUntil, input.windowFrom, input.windowUntil)
    ? 1
    : 0.4;
}

export function observationWeight(observation: PriceObservation, input: PriceRecommendInput): number {
  if (!Number.isFinite(observation.pricePerKwh) || observation.pricePerKwh < 0) return 0;
  if (!Number.isFinite(observation.quantityKwh) || observation.quantityKwh <= 0) return 0;
  const now = input.now ?? new Date();
  return (
    PRICE_KIND_WEIGHT[observation.kind] *
    observation.quantityKwh *
    recencyWeight(observation.occurredAt, now) *
    typeWeight(observation.energyType, input.energyType) *
    zoneWeight(observation.marketZone, input.marketZone) *
    windowWeight(observation, input)
  );
}

export function percentile(sorted: number[], p: number): number {
  const first = sorted[0];
  if (first === undefined) return Number.NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const loVal = sorted[lo] ?? first;
  const hiVal = sorted[hi] ?? loVal;
  if (lo === hi) return loVal;
  return loVal * (hi - idx) + hiVal * (idx - lo);
}

function dataQualityFor(score: number, nTrades: number, nSamples: number): DataQuality {
  if (nSamples === 0) return DataQuality.INSUFFICIENT;
  if (score >= 0.7 && nTrades >= 3) return DataQuality.HIGH;
  if (score >= 0.35 || nSamples >= 3) return DataQuality.MEDIUM;
  return DataQuality.LOW;
}

function insufficient(input: PriceRecommendInput): PriceRecommendResult {
  return {
    recommendedPrice: null,
    range: { min: null, max: null },
    confidence: 0,
    reason:
      "No completed trades or live offers/bids match these filters. Advisory only; no price is suggested.",
    dataQuality: DataQuality.INSUFFICIENT,
    sourceLabel: DataSourceLabel.ACTUAL,
    sampleCounts: { trades: 0, asks: 0, bids: 0 },
    advisory: true,
    filters: {
      energyType: input.energyType,
      marketZone: input.marketZone,
    },
  };
}

export function recommendPrice(input: PriceRecommendInput): PriceRecommendResult {
  const weighted = input.observations
    .map((observation) => ({ observation, weight: observationWeight(observation, input) }))
    .filter((row) => row.weight > 0);

  if (weighted.length === 0) return insufficient(input);

  const totalWeight = weighted.reduce((sum, row) => sum + row.weight, 0);
  const vwap = weighted.reduce((sum, row) => sum + row.observation.pricePerKwh * row.weight, 0) / totalWeight;
  const prices = weighted.map((row) => row.observation.pricePerKwh).sort((a, b) => a - b);
  const min = prices[0];
  const max = prices[prices.length - 1];
  if (min === undefined || max === undefined) return insufficient(input);
  const rangeMin = prices.length >= 4 ? percentile(prices, 0.25) : min;
  const rangeMax = prices.length >= 4 ? percentile(prices, 0.75) : max;

  const asks = weighted.filter((row) => row.observation.kind === "ask").map((row) => row.observation.pricePerKwh);
  const bids = weighted.filter((row) => row.observation.kind === "bid").map((row) => row.observation.pricePerKwh);
  let blended = vwap;
  if (asks.length > 0 && bids.length > 0) {
    const bestAsk = Math.min(...asks);
    const bestBid = Math.max(...bids);
    const mid = (bestAsk + bestBid) / 2;
    blended = 0.6 * vwap + 0.4 * mid;
  }
  const clamped = Math.min(max, Math.max(min, blended));
  const recommendedPrice = roundPrice(clamped);

  const nTrades = weighted.filter((row) => row.observation.kind === "trade").length;
  const nAsks = weighted.filter((row) => row.observation.kind === "ask").length;
  const nBids = weighted.filter((row) => row.observation.kind === "bid").length;
  const totalQty = weighted.reduce((sum, row) => sum + row.observation.quantityKwh, 0);
  const relSpread = recommendedPrice > 0 ? (max - min) / recommendedPrice : 1;
  const score = Math.min(
    1,
    Math.min(nTrades / 8, 1) * 0.5 +
      Math.min((nAsks + nBids) / 8, 1) * 0.2 +
      Math.min(totalQty / 100, 1) * 0.15 +
      Math.max(0, 1 - relSpread) * 0.15,
  );
  const confidence = Math.round(score * 1000) / 1000;
  const dataQuality = dataQualityFor(score, nTrades, weighted.length);

  return {
    recommendedPrice,
    range: { min: roundPrice(rangeMin), max: roundPrice(rangeMax) },
    confidence,
    reason: `Based on ${nTrades} completed trade(s), ${nAsks} live offer(s), and ${nBids} live bid(s). Volume-weighted advisory price ${recommendedPrice} per kWh. You choose the listed price.`,
    dataQuality,
    sourceLabel: DataSourceLabel.ACTUAL,
    sampleCounts: { trades: nTrades, asks: nAsks, bids: nBids },
    advisory: true,
    filters: {
      energyType: input.energyType,
      marketZone: input.marketZone,
    },
  };
}
