import { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export function collectErrorCodes(error: unknown, seen = new Set<unknown>()): string[] {
  if (typeof error !== "object" || error === null || seen.has(error)) return [];
  seen.add(error);
  const rec = error as { code?: unknown; meta?: { code?: unknown }; cause?: unknown };
  const codes: string[] = [];
  if (typeof rec.code === "string" || typeof rec.code === "number") codes.push(String(rec.code));
  if (typeof rec.meta?.code === "string" || typeof rec.meta?.code === "number") {
    codes.push(String(rec.meta.code));
  }
  codes.push(...collectErrorCodes(rec.cause, seen));
  return codes;
}

export function isRetryableConcurrencyError(error: unknown): boolean {
  const codes = new Set(collectErrorCodes(error).map((code) => String(code).toUpperCase()));
  if (codes.has("P2034") || codes.has("40001") || codes.has("40P01")) return true;
  const rec = error as { message?: string; meta?: { message?: string } };
  const text = `${rec.message ?? ""} ${rec.meta?.message ?? ""}`.toLowerCase();
  return (
    text.includes("could not serialize") ||
    text.includes("serialization failure") ||
    text.includes("deadlock detected") ||
    text.includes("write conflict") ||
    text.includes("concurrent update")
  );
}

function backoffMs(attempt: number): number {
  return 15 * 2 ** attempt;
}

export async function withSerializableRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  attempts = 8,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 15_000,
      });
    } catch (error) {
      lastError = error;
      if (!isRetryableConcurrencyError(error) || attempt >= attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, backoffMs(attempt)));
    }
  }
  throw lastError;
}

function orderedIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

export async function lockListings(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  const ordered = orderedIds(ids);
  if (ordered.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "Listing"
    WHERE id IN (${Prisma.join(ordered)})
    ORDER BY id
    FOR UPDATE
  `;
}

export async function lockBids(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  const ordered = orderedIds(ids);
  if (ordered.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "Bid"
    WHERE id IN (${Prisma.join(ordered)})
    ORDER BY id
    FOR UPDATE
  `;
}

export async function lockMatches(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  const ordered = orderedIds(ids);
  if (ordered.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM "Match"
    WHERE id IN (${Prisma.join(ordered)})
    ORDER BY id
    FOR UPDATE
  `;
}
