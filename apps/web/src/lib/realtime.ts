const EVENT_QUERY_KEYS: Record<string, string[][]> = {
  "listing:created": [["listings"], ["listing"], ["pricing"], ["analytics"]],
  "listing:updated": [["listings"], ["listing"], ["pricing"], ["analytics"]],
  "listing:expired": [["listings"], ["listing"], ["pricing"], ["analytics"]],
  "bid:created": [["bids"], ["bid"], ["listings"], ["pricing"], ["analytics"]],
  "bid:updated": [["bids"], ["bid"], ["pricing"], ["analytics"]],
  "bid:matched": [["bids"], ["bid"], ["matches"], ["listings"], ["pricing"], ["analytics"]],
  "bid:expired": [["bids"], ["bid"], ["pricing"], ["analytics"]],
  "match:created": [["matches"], ["bids"], ["listings"], ["analytics"]],
  "match:updated": [["matches"], ["analytics"]],
  "trade:pending": [["matches"], ["trades"], ["analytics"], ["pricing"]],
  "trade:confirmed": [["matches"], ["trades"], ["analytics"], ["pricing"]],
  "trade:failed": [["matches"], ["trades"], ["analytics"]],
  "notification:new": [["notifications"]],
  "dashboard:updated": [["listings"], ["bids"], ["matches"], ["notifications"], ["wallets"], ["analytics"], ["pricing"]],
};

export function queryKeysForSocketEvent(event: string): string[][] {
  return EVENT_QUERY_KEYS[event] ?? [];
}

export function shouldApplyEvent(eventId: string, seen: Set<string>, max = 250): boolean {
  if (!eventId) return true;
  if (seen.has(eventId)) return false;
  seen.add(eventId);
  if (seen.size > max) {
    const oldest = seen.values().next().value;
    if (oldest) seen.delete(oldest);
  }
  return true;
}

export function envelopeEventId(payload: unknown): string {
  if (payload && typeof payload === "object" && "eventId" in payload) {
    const id = (payload as { eventId?: unknown }).eventId;
    return typeof id === "string" ? id : "";
  }
  return "";
}
