import type {
  BidStatus,
  BlockchainTxStatus,
  DataQuality,
  DataSourceLabel,
  EnergyType,
  ListingStatus,
  MatchStatus,
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
  matchedKwh: number;
  pricePerKwh: number;
  status: MatchStatus;
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
}

export interface HealthPayload {
  status: "ok" | "degraded";
  service: "enermesh-api";
  version: string;
  timestamp: string;
  database: "connected" | "disconnected" | "unknown";
  sprint: string;
}
