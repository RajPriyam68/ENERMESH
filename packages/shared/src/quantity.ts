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
 * Sold quantity is never changed from this path.
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

export function applyFill(current: QuantityTriple, fillKwh: number): QuantityTriple {
  const fill = roundKwh(fillKwh);
  return {
    originalQuantityKwh: roundKwh(current.originalQuantityKwh),
    availableQuantityKwh: roundKwh(current.availableQuantityKwh - fill),
    soldQuantityKwh: roundKwh(current.soldQuantityKwh + fill),
  };
}

export interface BidQuantityTriple {
  requestedKwh: number;
  unmatchedKwh: number;
  matchedKwh: number;
}

export function checkBidQuantity(q: BidQuantityTriple): QuantityCheck {
  const requested = roundKwh(q.requestedKwh);
  const unmatched = roundKwh(q.unmatchedKwh);
  const matched = roundKwh(q.matchedKwh);
  if (!Number.isFinite(requested) || !Number.isFinite(unmatched) || !Number.isFinite(matched)) {
    return { ok: false, reason: "Bid quantity values must be finite numbers" };
  }
  if (requested <= 0) {
    return { ok: false, reason: "requestedKwh must be > 0" };
  }
  if (unmatched < 0) {
    return { ok: false, reason: "unmatchedKwh must be >= 0" };
  }
  if (matched < 0) {
    return { ok: false, reason: "matchedKwh must be >= 0" };
  }
  if (roundKwh(unmatched + matched) !== requested) {
    return { ok: false, reason: "unmatchedKwh + matchedKwh must equal requestedKwh" };
  }
  return { ok: true };
}

export function applyBidFill(current: BidQuantityTriple, fillKwh: number): BidQuantityTriple {
  const fill = roundKwh(fillKwh);
  return {
    requestedKwh: roundKwh(current.requestedKwh),
    unmatchedKwh: roundKwh(current.unmatchedKwh - fill),
    matchedKwh: roundKwh(current.matchedKwh + fill),
  };
}
