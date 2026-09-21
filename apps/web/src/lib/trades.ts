import type { TradePublic } from "@enermesh/shared";
import { apiRequest } from "./api";

export type TradeReportAction = "purchase" | "settle" | "reject";

const IDEMPOTENCY_KEY = "enermesh.s4.idempotency";

function readMap(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IDEMPOTENCY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function writeMap(value: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(IDEMPOTENCY_KEY, JSON.stringify(value));
}

export function tradeIdempotencyKey(matchId: string, action: TradeReportAction): string {
  const slot = `${matchId}:${action}`;
  const current = readMap();
  if (current[slot]) return current[slot];
  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `idem-${matchId}-${action}-${Date.now()}`;
  current[slot] = generated;
  writeMap(current);
  return generated;
}

export function rotateTradeIdempotencyKey(matchId: string, action: TradeReportAction): string {
  const slot = `${matchId}:${action}`;
  const current = readMap();
  delete current[slot];
  writeMap(current);
  return tradeIdempotencyKey(matchId, action);
}

export async function reportTrade(
  token: string | null,
  input: { matchId: string; action: TradeReportAction; txHash?: string },
): Promise<TradePublic> {
  const body = {
    matchId: input.matchId,
    action: input.action,
    idempotencyKey: tradeIdempotencyKey(input.matchId, input.action),
    ...(input.txHash ? { txHash: input.txHash } : {}),
  };
  const result = await apiRequest<{ trade: TradePublic }>("/trades/report", {
    method: "POST",
    token,
    body,
  });
  return result.trade;
}

export async function listTradesForMatch(token: string | null, matchId: string): Promise<TradePublic[]> {
  const result = await apiRequest<{ trades: TradePublic[] }>(`/trades?matchId=${encodeURIComponent(matchId)}&pageSize=20`, {
    token,
  });
  return result.trades;
}
