import { Interface } from "ethers";
import type { RpcLog, RpcReceipt } from "./chain-rpc.js";

export const LISTING_CREATED_TOPIC =
  "0x12dc294b81a709d694b1337a350a12a00076c19a77a25aab67a5f0c07e0f164d";
export const ENERGY_PURCHASED_TOPIC =
  "0xa048ed06be287289253cf8ad035fb91ecbbcb2d20d13380d25ac345cc627d429";
export const TRADE_SETTLED_TOPIC =
  "0xad940b63e9eddcb865c714b11742f31c912439f2b51c704d05355cc8b1772f86";
export const CREATE_LISTING_SELECTOR = "0xb03053b6";

const marketplaceInterface = new Interface([
  "event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 quantityKwh, uint256 pricePerKwh)",
  "event EnergyPurchased(uint256 indexed listingId, uint256 indexed tradeId, address indexed buyer, uint256 quantityKwh, uint256 totalPaid)",
  "event TradeSettled(uint256 indexed tradeId, address indexed seller, address indexed buyer, uint256 quantityKwh)",
]);

export interface ListingCreatedEvent {
  listingId: bigint;
  seller: string;
  quantityKwh: bigint;
  pricePerKwh: bigint;
}

export interface CreateListingCall {
  quantityKwh: bigint;
  pricePerKwh: bigint;
  externalId: bigint;
}

export interface EnergyPurchasedEvent {
  listingId: bigint;
  tradeId: bigint;
  buyer: string;
  quantityKwh: bigint;
  totalPaid: bigint;
}

export interface TradeSettledEvent {
  tradeId: bigint;
  seller: string;
  buyer: string;
  quantityKwh: bigint;
}

export function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export function isConfiguredContractAddress(address: string | undefined | null): boolean {
  if (!address) return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address) && address !== "0x0000000000000000000000000000000000000000";
}

export function sameAddress(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

export function toMilliKwh(kwh: number): bigint {
  if (!Number.isFinite(kwh) || kwh <= 0) return 0n;
  return BigInt(Math.round(kwh * 1000));
}

export function priceToWeiPerMilliKwh(pricePerKwh: number): bigint {
  if (!Number.isFinite(pricePerKwh) || pricePerKwh <= 0) return 0n;
  const micros = BigInt(Math.round(pricePerKwh * 1_000_000));
  return (micros * 10n ** 12n) / 1000n;
}

export function purchaseValueWei(quantityMilliKwh: bigint, priceWeiPerMilliKwh: bigint): bigint {
  return quantityMilliKwh * priceWeiPerMilliKwh;
}

function parseLog(log: RpcLog) {
  try {
    return marketplaceInterface.parseLog({
      topics: log.topics as [string, ...string[]],
      data: log.data,
    });
  } catch {
    return null;
  }
}

export function uuidToUint256(id: string): bigint {
  const hex = id.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) return 0n;
  return BigInt(`0x${hex}`);
}

export function parseCreateListingInput(input: string): CreateListingCall | null {
  const hex = input.startsWith("0x") ? input.slice(2).toLowerCase() : input.toLowerCase();
  const selector = CREATE_LISTING_SELECTOR.slice(2);
  if (!hex.startsWith(selector) || hex.length < selector.length + 64 * 3) return null;
  const quantityKwh = BigInt(`0x${hex.slice(8, 72)}`);
  const pricePerKwh = BigInt(`0x${hex.slice(72, 136)}`);
  const externalId = BigInt(`0x${hex.slice(136, 200)}`);
  return { quantityKwh, pricePerKwh, externalId };
}

export function parseListingCreatedLogs(receipt: RpcReceipt, contractAddress: string): ListingCreatedEvent[] {
  const events: ListingCreatedEvent[] = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, contractAddress)) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== LISTING_CREATED_TOPIC) continue;
    const parsed = parseLog(log);
    if (!parsed || parsed.name !== "ListingCreated") continue;
    events.push({
      listingId: parsed.args.listingId as bigint,
      seller: normalizeAddress(parsed.args.seller as string),
      quantityKwh: parsed.args.quantityKwh as bigint,
      pricePerKwh: parsed.args.pricePerKwh as bigint,
    });
  }
  return events;
}

export function parseEnergyPurchasedLogs(
  receipt: RpcReceipt,
  contractAddress: string,
): EnergyPurchasedEvent[] {
  const events: EnergyPurchasedEvent[] = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, contractAddress)) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== ENERGY_PURCHASED_TOPIC) continue;
    const parsed = parseLog(log);
    if (!parsed || parsed.name !== "EnergyPurchased") continue;
    events.push({
      listingId: parsed.args.listingId as bigint,
      tradeId: parsed.args.tradeId as bigint,
      buyer: normalizeAddress(parsed.args.buyer as string),
      quantityKwh: parsed.args.quantityKwh as bigint,
      totalPaid: parsed.args.totalPaid as bigint,
    });
  }
  return events;
}

export function parseTradeSettledLogs(receipt: RpcReceipt, contractAddress: string): TradeSettledEvent[] {
  const events: TradeSettledEvent[] = [];
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, contractAddress)) continue;
    if ((log.topics[0] ?? "").toLowerCase() !== TRADE_SETTLED_TOPIC) continue;
    const parsed = parseLog(log);
    if (!parsed || parsed.name !== "TradeSettled") continue;
    events.push({
      tradeId: parsed.args.tradeId as bigint,
      seller: normalizeAddress(parsed.args.seller as string),
      buyer: normalizeAddress(parsed.args.buyer as string),
      quantityKwh: parsed.args.quantityKwh as bigint,
    });
  }
  return events;
}
