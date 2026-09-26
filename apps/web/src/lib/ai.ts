import type { AiInsight, AiInsightRequest, AiStatus, EnergyType } from "@enermesh/shared";

export interface AiInsightResponse {
  insight: AiInsight;
  status: AiStatus;
}

export interface AiPanelQuery {
  energyType?: EnergyType;
  marketZone?: string;
  listingId?: string;
  bidId?: string;
}

export function defaultAiTopic(query: AiPanelQuery): AiInsightRequest["topic"] {
  if (query.listingId) return "listing";
  if (query.bidId) return "bid";
  return "dashboard";
}

export function buildAiInsightRequest(
  query: AiPanelQuery,
  question?: string,
  topic?: AiInsightRequest["topic"],
): AiInsightRequest {
  const resolved = topic ?? defaultAiTopic(query);
  return {
    topic: resolved,
    ...(question?.trim() ? { question: question.trim().slice(0, 500) } : {}),
    ...(query.energyType ? { energyType: query.energyType } : {}),
    ...(query.marketZone?.trim() ? { marketZone: query.marketZone.trim() } : {}),
    ...(resolved === "listing" && query.listingId ? { listingId: query.listingId } : {}),
    ...(resolved === "bid" && query.bidId ? { bidId: query.bidId } : {}),
  };
}

export function insightShowsFallback(insight: AiInsight): boolean {
  return insight.usedFallback || insight.providerStatus !== "configured";
}
