import type {
  BidStatus,
  BlockchainTxStatus,
  DataQuality,
  DataSourceLabel,
  EnergyType,
  ListingStatus,
  MatchStatus,
  NotificationType,
  TradeStatus,
  UserRole,
} from "./enums.js";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  accessExpiresAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  phone: string | null;
  bio: string | null;
  defaultMarketZone: string | null;
  energyTypesOfInterest: EnergyType[];
  notificationEmail: boolean;
  notificationInApp: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface ListingPublic {
  id: string;
  sellerId: string;
  sellerDisplayName: string;
  energyType: EnergyType;
  originalQuantityKwh: number;
  availableQuantityKwh: number;
  soldQuantityKwh: number;
  minTradeKwh: number;
  maxTradeKwh: number;
  pricePerKwh: number;
  location: string;
  marketZone: string;
  availableFrom: string;
  availableUntil: string;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BidPublic {
  id: string;
  buyerId: string;
  listingId?: string;
  requestedKwh: number;
  unmatchedKwh: number;
  matchedKwh: number;
  maxPricePerKwh: number;
  energyType: EnergyType;
  marketZone: string;
  requiredFrom: string;
  requiredUntil: string;
  status: BidStatus;
  createdAt: string;
}

export interface MatchPublic {
  id: string;
  listingId: string;
  bidId: string;
  sellerId: string;
  buyerId: string;
  matchedKwh: number;
  pricePerKwh: number;
  status: MatchStatus;
  energyType: EnergyType;
  marketZone: string;
  listingLocation: string;
  createdAt: string;
}

export interface TradePublic {
  id: string;
  matchId: string;
  buyerId: string;
  sellerId: string;
  quantityKwh: number;
  pricePerKwh: number;
  totalAmount: number;
  status: TradeStatus;
  blockchainTxStatus: BlockchainTxStatus;
  txHash?: string;
  blockNumber?: number;
  contractAddress?: string;
  network?: string;
  explorerUrl?: string;
}

export interface PriceRecommendation {
  recommendedPrice: number | null;
  range: { min: number | null; max: number | null };
  confidence: number;
  reason: string;
  dataQuality: DataQuality;
  sourceLabel: DataSourceLabel;
  sampleCounts: { trades: number; asks: number; bids: number };
  advisory: true;
  filters: {
    energyType?: EnergyType;
    marketZone?: string;
  };
}

export interface LabelledMetric {
  value: number | null;
  unit: string;
  sourceLabel: DataSourceLabel;
  dataQuality: DataQuality;
  note: string;
}

export interface AnalyticsSeriesPoint {
  date: string;
  energyTradedKwh: number;
  transactionValue: number;
  sourceLabel: DataSourceLabel;
}

export interface AnalyticsBreakdownRow {
  key: string;
  energyTradedKwh: number;
  transactionValue: number;
  sourceLabel: DataSourceLabel;
}

export interface AnalyticsSnapshot {
  scope: "self" | "platform";
  energyTradedKwh: LabelledMetric;
  transactionValue: LabelledMetric;
  averagePricePerKwh: LabelledMetric;
  supplyKwh: LabelledMetric;
  demandKwh: LabelledMetric;
  matchedKwh: LabelledMetric;
  unmatchedKwh: LabelledMetric;
  revenue: LabelledMetric;
  spending: LabelledMetric;
  renewableShare: LabelledMetric;
  estimatedCarbonSavingsKg: LabelledMetric;
  byEnergyType: AnalyticsBreakdownRow[];
  byMarketZone: AnalyticsBreakdownRow[];
  series: AnalyticsSeriesPoint[];
  generatedAt: string;
}

export const AiTopic = {
  MARKET: "market",
  PRICE: "price",
  LISTING: "listing",
  BID: "bid",
  DASHBOARD: "dashboard",
} as const;
export type AiTopic = (typeof AiTopic)[keyof typeof AiTopic];

export const AiProviderStatus = {
  CONFIGURED: "configured",
  UNAVAILABLE: "unavailable",
  ERROR: "error",
} as const;
export type AiProviderStatus = (typeof AiProviderStatus)[keyof typeof AiProviderStatus];

export interface AiRecommendationFacts {
  recommendedPrice: number | null;
  rangeMin: number | null;
  rangeMax: number | null;
  confidence: number;
  dataQuality: DataQuality;
  reason: string;
  sampleCounts: { trades: number; asks: number; bids: number };
}

export interface AiAnalyticsFacts {
  scope: "self" | "platform";
  energyTradedKwh: number | null;
  transactionValue: number | null;
  averagePricePerKwh: number | null;
  supplyKwh: number | null;
  demandKwh: number | null;
  matchedKwh: number | null;
  unmatchedKwh: number | null;
  revenue: number | null;
  spending: number | null;
  renewableShare: number | null;
  estimatedCarbonSavingsKg: number | null;
  carbonSourceLabel: DataSourceLabel;
}

export interface AiListingFacts {
  id: string;
  energyType: EnergyType;
  marketZone: string;
  pricePerKwh: number;
  availableQuantityKwh: number;
  soldQuantityKwh: number;
  status: ListingStatus;
}

export interface AiBidFacts {
  id: string;
  energyType: EnergyType;
  marketZone: string;
  maxPricePerKwh: number;
  unmatchedKwh: number;
  matchedKwh: number;
  status: BidStatus;
}

export interface AiFacts {
  recommendation: AiRecommendationFacts | null;
  analytics: AiAnalyticsFacts | null;
  listing: AiListingFacts | null;
  bid: AiBidFacts | null;
}

export interface AiInsight {
  advisory: true;
  actionsEnabled: false;
  sourceLabel: DataSourceLabel;
  dataQuality: DataQuality;
  providerStatus: AiProviderStatus;
  provider: string | null;
  model: string | null;
  usedFallback: boolean;
  summary: string;
  bullets: string[];
  caveats: string[];
  facts: AiFacts;
  generatedAt: string;
}

export interface AiStatus {
  configured: boolean;
  available: boolean;
  provider: string | null;
  model: string | null;
  advisoryOnly: true;
  actionsEnabled: false;
}

export const IotAdapterName = {
  HTTP: "http",
  SIMULATED: "simulated",
  MQTT: "mqtt",
} as const;
export type IotAdapterName = (typeof IotAdapterName)[keyof typeof IotAdapterName];

export interface EnergyHistoryPublic {
  id: string;
  userId: string;
  deviceId: string | null;
  kwh: number;
  recordedAt: string;
  sourceLabel: DataSourceLabel;
  energyType: EnergyType | null;
  adapter: IotAdapterName;
  createdAt: string;
}

export interface EnergyHistorySourceTotals {
  sampleCount: number;
  totalKwh: number;
}

export interface EnergyHistorySummary {
  sampleCount: number;
  totalKwh: number;
  bySourceLabel: Record<DataSourceLabel, EnergyHistorySourceTotals>;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
}

export interface IotStatus {
  httpIngest: true;
  simulated: true;
  mqttConfigured: boolean;
  mqttAvailable: false;
  writesMarketplace: false;
  advisoryOnly: true;
}

export interface HealthPayload {
  status: "ok" | "degraded";
  service: "enermesh-api";
  version: string;
  timestamp: string;
  database: "connected" | "disconnected" | "unknown";
  sprint: string;
}

export interface NotificationPublic {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  readAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface SocketEnvelope<T> {
  eventId: string;
  occurredAt: string;
  data: T;
}

export interface ListingChangedPayload {
  listingId: string;
  listing?: ListingPublic;
}

export interface BidChangedPayload {
  bid: BidPublic;
}

export interface MatchChangedPayload {
  match: MatchPublic;
}

export interface TradeChangedPayload {
  trade: TradePublic;
}

export interface EnergyChangedPayload {
  sample: EnergyHistoryPublic;
}

export interface DashboardUpdatedPayload {
  reason: "listing" | "bid" | "match" | "trade" | "wallet" | "energy";
  listingId?: string;
  bidId?: string;
  matchId?: string;
  tradeId?: string;
  energyHistoryId?: string;
}

export interface SystemHelloPayload {
  service: "enermesh";
  sprint: string;
  userId: string;
  message: string;
}
