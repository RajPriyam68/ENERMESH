export const MARKETPLACE_SELECTORS = {
  createListing: "0xb03053b6",
  updateListing: "0x0792d3f4",
  cancelListing: "0x305a67a8",
  purchaseEnergy: "0x03b5baae",
  settleTrade: "0x73422d93",
  listings: "0xde74e57b",
  trades: "0x1e6c598e",
} as const;

export const LISTING_CREATED_TOPIC =
  "0x12dc294b81a709d694b1337a350a12a00076c19a77a25aab67a5f0c07e0f164d";
export const ENERGY_PURCHASED_TOPIC =
  "0xa048ed06be287289253cf8ad035fb91ecbbcb2d20d13380d25ac345cc627d429";
export const TRADE_SETTLED_TOPIC =
  "0xad940b63e9eddcb865c714b11742f31c912439f2b51c704d05355cc8b1772f86";

export const ONCHAIN_LISTING_ACTIVE = 1;
export const ONCHAIN_LISTING_CANCELLED = 2;
export const ONCHAIN_LISTING_SOLD_OUT = 3;

const LISTING_STORAGE_KEY = "enermesh.s4.onChainListings";
const TRADE_STORAGE_KEY = "enermesh.s4.onChainTrades";

export interface OnChainListing {
  seller: string;
  remainingKwh: bigint;
  pricePerKwh: bigint;
  externalId: bigint;
  status: number;
}

export interface EncodedCall {
  data: string;
  valueWei: bigint;
}

export function encodeUint256(value: bigint | number): string {
  const asBig = typeof value === "bigint" ? value : BigInt(value);
  if (asBig < 0n) throw new Error("Unsigned value required");
  return asBig.toString(16).padStart(64, "0");
}

export function encodeSelectorCall(selector: string, ...values: Array<bigint | number>): string {
  return `${selector}${values.map((value) => encodeUint256(value)).join("")}`;
}

export function toMilliKwh(kwh: number): bigint {
  if (!Number.isFinite(kwh) || kwh <= 0) throw new Error("Quantity must be greater than 0");
  return BigInt(Math.round(kwh * 1000));
}

export function priceToWeiPerMilliKwh(pricePerKwh: number): bigint {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh <= 0) {
    throw new Error("Price must be greater than 0");
  }
  const micros = BigInt(Math.round(pricePerKwh * 1_000_000));
  return (micros * 10n ** 12n) / 1000n;
}

export function purchaseValueWei(quantityMilliKwh: bigint, priceWeiPerMilliKwh: bigint): bigint {
  return quantityMilliKwh * priceWeiPerMilliKwh;
}

export function uuidToUint256(id: string): bigint {
  const hex = id.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return 0n;
  return BigInt(`0x${hex}`);
}

export function encodeCreateListing(quantityKwh: bigint, pricePerKwh: bigint, externalId: bigint): EncodedCall {
  return { data: encodeSelectorCall(MARKETPLACE_SELECTORS.createListing, quantityKwh, pricePerKwh, externalId), valueWei: 0n };
}

export function encodePurchaseEnergy(listingId: bigint, quantityKwh: bigint, valueWei: bigint): EncodedCall {
  return { data: encodeSelectorCall(MARKETPLACE_SELECTORS.purchaseEnergy, listingId, quantityKwh), valueWei };
}

export function encodeSettleTrade(tradeId: bigint): EncodedCall {
  return { data: encodeSelectorCall(MARKETPLACE_SELECTORS.settleTrade, tradeId), valueWei: 0n };
}

export function encodeListingsQuery(listingId: bigint): string {
  return encodeSelectorCall(MARKETPLACE_SELECTORS.listings, listingId);
}

export function parseHexWord(word: string): bigint {
  const trimmed = word.startsWith("0x") ? word.slice(2) : word;
  if (!trimmed) return 0n;
  return BigInt(`0x${trimmed}`);
}

export function parseOnChainListing(data: string): OnChainListing | null {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  if (hex.length < 64 * 5) return null;
  const sellerWord = hex.slice(0, 64);
  const seller = `0x${sellerWord.slice(24)}`;
  if (seller === "0x0000000000000000000000000000000000000000") return null;
  return {
    seller,
    remainingKwh: parseHexWord(hex.slice(64, 128)),
    pricePerKwh: parseHexWord(hex.slice(128, 192)),
    externalId: parseHexWord(hex.slice(192, 256)),
    status: Number(parseHexWord(hex.slice(256, 320))),
  };
}

export function parseIndexedUintTopic(topic: string | undefined): bigint | null {
  if (!topic) return null;
  return parseHexWord(topic);
}

export function listingIdFromCreatedLog(log: { topics?: string[] }): bigint | null {
  if (log.topics?.[0]?.toLowerCase() !== LISTING_CREATED_TOPIC) return null;
  return parseIndexedUintTopic(log.topics[1]);
}

export function tradeIdFromPurchasedLog(log: { topics?: string[] }): bigint | null {
  if (log.topics?.[0]?.toLowerCase() !== ENERGY_PURCHASED_TOPIC) return null;
  return parseIndexedUintTopic(log.topics[2]);
}

export function formatWeiAmount(wei: bigint, symbol: string, digits = 6): string {
  const negative = wei < 0n;
  const value = negative ? -wei : wei;
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, "0").slice(0, digits).replace(/0+$/, "");
  const rendered = fraction.length > 0 ? `${whole.toString()}.${fraction}` : whole.toString();
  return `${negative ? "-" : ""}${rendered} ${symbol}`;
}

function readMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(key: string, value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getStoredOnChainListingId(listingUuid: string): string | null {
  return readMap(LISTING_STORAGE_KEY)[listingUuid] ?? null;
}

export function storeOnChainListingId(listingUuid: string, onChainId: string) {
  const current = readMap(LISTING_STORAGE_KEY);
  current[listingUuid] = onChainId;
  writeMap(LISTING_STORAGE_KEY, current);
}

export function getStoredOnChainTradeId(matchId: string): string | null {
  return readMap(TRADE_STORAGE_KEY)[matchId] ?? null;
}

export function storeOnChainTradeId(matchId: string, onChainTradeId: string) {
  const current = readMap(TRADE_STORAGE_KEY);
  current[matchId] = onChainTradeId;
  writeMap(TRADE_STORAGE_KEY, current);
}

export function toHexQuantity(value: bigint): string {
  return `0x${value.toString(16)}`;
}
