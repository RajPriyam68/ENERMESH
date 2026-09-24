const EVENT_QUERY_KEYS: Record<string, string[][]> = {
  "listing:created": [["listings"], ["listing"]],
  "listing:updated": [["listings"], ["listing"]],
  "listing:expired": [["listings"], ["listing"]],
  "bid:created": [["bids"], ["bid"], ["listings"]],
  "bid:updated": [["bids"], ["bid"]],
  "bid:matched": [["bids"], ["bid"], ["matches"], ["listings"]],
  "bid:expired": [["bids"], ["bid"]],
  "match:created": [["matches"], ["bids"], ["listings"]],
  "match:updated": [["matches"]],
  "trade:pending": [["matches"], ["trades"]],
  "trade:confirmed": [["matches"], ["trades"]],
  "trade:failed": [["matches"], ["trades"]],
  "notification:new": [["notifications"]],
  "dashboard:updated": [["listings"], ["bids"], ["matches"], ["notifications"], ["wallets"]],
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
