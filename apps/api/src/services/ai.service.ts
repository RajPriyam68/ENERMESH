import {
  AI_SYSTEM_PROMPT,
  AiProviderStatus,
  AiTopic,
  buildAiUserPrompt,
  buildFallbackInsight,
  insightFromModelOutput,
  parseAiModelJson,
  sanitizeUntrustedText,
  slimAnalytics,
  slimPriceRecommendation,
  type AiFacts,
  type AiInsight,
  type AiInsightRequest,
  type AiStatus,
  type BidPublic,
  type ListingPublic,
} from "@enermesh/shared";
import { recordAudit } from "../lib/audit.js";
import { getAnalytics } from "./analytics.service.js";
import { completeChat, getLlmConfig } from "./ai-provider.js";
import { getBidById } from "./bid.service.js";
import { getListingById } from "./listing.service.js";
import { getPriceRecommendation } from "./price.service.js";

export function getAiStatus(): AiStatus {
  const config = getLlmConfig();
  return {
    configured: config.configured,
    available: config.configured,
    provider: config.configured ? config.provider : null,
    model: config.configured ? config.model : null,
    advisoryOnly: true,
    actionsEnabled: false,
  };
}

function listingFacts(listing: ListingPublic): NonNullable<AiFacts["listing"]> {
  return {
    id: listing.id,
    energyType: listing.energyType,
    marketZone: listing.marketZone,
    pricePerKwh: listing.pricePerKwh,
    availableQuantityKwh: listing.availableQuantityKwh,
    soldQuantityKwh: listing.soldQuantityKwh,
    status: listing.status,
  };
}

function bidFacts(bid: BidPublic): NonNullable<AiFacts["bid"]> {
  return {
    id: bid.id,
    energyType: bid.energyType,
    marketZone: bid.marketZone,
    maxPricePerKwh: bid.maxPricePerKwh,
    unmatchedKwh: bid.unmatchedKwh,
    matchedKwh: bid.matchedKwh,
    status: bid.status,
  };
}

async function collectFacts(
  actor: { id: string; role: "BUYER" | "SELLER" | "ADMIN" },
  request: AiInsightRequest,
): Promise<AiFacts> {
  const energyType = request.energyType;
  const marketZone = request.marketZone;
  const needsListing = request.topic === AiTopic.LISTING || Boolean(request.listingId);
  const needsBid = request.topic === AiTopic.BID || Boolean(request.bidId);

  const [recommendation, analytics, listing, bid] = await Promise.all([
    getPriceRecommendation({ energyType, marketZone }),
    getAnalytics(actor, { energyType, marketZone }),
    needsListing && request.listingId ? getListingById(request.listingId) : Promise.resolve(null),
    needsBid && request.bidId ? getBidById(actor, request.bidId) : Promise.resolve(null),
  ]);

  return {
    recommendation: slimPriceRecommendation(recommendation),
    analytics: slimAnalytics(analytics),
    listing: listing ? listingFacts(listing) : null,
    bid: bid ? bidFacts(bid) : null,
  };
}

export async function createAiInsight(
  actor: { id: string; role: "BUYER" | "SELLER" | "ADMIN" },
  request: AiInsightRequest,
  meta: { ipAddress?: string | null } = {},
): Promise<{ insight: AiInsight; status: AiStatus }> {
  const question = request.question ? sanitizeUntrustedText(request.question) : undefined;
  const facts = await collectFacts(actor, request);
  const status = getAiStatus();
  const config = getLlmConfig();

  let insight: AiInsight;
  if (!status.configured) {
    insight = buildFallbackInsight({
      topic: request.topic,
      facts,
      question,
      providerStatus: AiProviderStatus.UNAVAILABLE,
    });
  } else {
    try {
      const raw = await completeChat([
        { role: "system", content: AI_SYSTEM_PROMPT },
        { role: "user", content: buildAiUserPrompt(request.topic, facts, question) },
      ]);
      const parsed = parseAiModelJson(raw);
      insight = parsed
        ? insightFromModelOutput({
            output: parsed,
            facts,
            provider: config.provider,
            model: config.model,
          })
        : buildFallbackInsight({
            topic: request.topic,
            facts,
            question,
            providerStatus: AiProviderStatus.ERROR,
            provider: config.provider,
            model: config.model,
          });
    } catch {
      insight = buildFallbackInsight({
        topic: request.topic,
        facts,
        question,
        providerStatus: AiProviderStatus.ERROR,
        provider: config.provider,
        model: config.model,
      });
    }
  }

  await recordAudit({
    userId: actor.id,
    action: "ADMIN_ACTION",
    entityType: "AiInsight",
    ipAddress: meta.ipAddress ?? null,
    metadata: {
      topic: request.topic,
      usedFallback: insight.usedFallback,
      providerStatus: insight.providerStatus,
      provider: insight.provider,
      listingId: request.listingId ?? null,
      bidId: request.bidId ?? null,
      hasQuestion: Boolean(question),
    },
  });

  return { insight, status };
}
