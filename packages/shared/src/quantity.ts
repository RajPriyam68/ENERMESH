/**
 * Quantity integrity for listings. All kWh values are compared at 3 decimal
 * places so Prisma Decimal(18,3) values and JSON numbers stay consistent.
 */
export function roundKwh(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function roundPrice(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export interface QuantityTriple {
  originalQuantityKwh: number;
  availableQuantityKwh: number;
  soldQuantityKwh: number;
}

export interface QuantityCheck {
  ok: boolean;
  reason?: string;
}

export function checkQuantityIntegrity(q: QuantityTriple): QuantityCheck {
  const original = roundKwh(q.originalQuantityKwh);
  const available = roundKwh(q.availableQuantityKwh);
  const sold = roundKwh(q.soldQuantityKwh);

  if (!Number.isFinite(original) || !Number.isFinite(available) || !Number.isFinite(sold)) {
    return { ok: false, reason: "Quantity values must be finite numbers" };
  }
  if (original <= 0) {
    return { ok: false, reason: "originalQuantityKwh must be > 0" };
  }
  if (available < 0) {
    return { ok: false, reason: "availableQuantityKwh must be >= 0" };
  }
  if (sold < 0) {
    return { ok: false, reason: "soldQuantityKwh must be >= 0" };
  }
  if (sold > original) {
    return { ok: false, reason: "soldQuantityKwh cannot exceed originalQuantityKwh" };
  }
  if (roundKwh(available + sold) !== original) {
    return { ok: false, reason: "availableQuantityKwh + soldQuantityKwh must equal originalQuantityKwh" };
  }
  return { ok: true };
}

export function quantitiesFromAvailable(availableKwh: number): QuantityTriple {
  const available = roundKwh(availableKwh);
  return {
    originalQuantityKwh: available,
    availableQuantityKwh: available,
    soldQuantityKwh: 0,
  };
}

/**
 * Recomputes original/available after a seller edits remaining kWh.
 * Sold quantity is never changed from this path (fills belong to S3+).
 */
export function resizeRemaining(current: QuantityTriple, nextAvailableKwh: number): QuantityTriple {
  const sold = roundKwh(current.soldQuantityKwh);
  const available = roundKwh(nextAvailableKwh);
  return {
    originalQuantityKwh: roundKwh(available + sold),
    availableQuantityKwh: available,
    soldQuantityKwh: sold,
  };
}
