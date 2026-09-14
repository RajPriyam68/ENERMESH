export const UserRole = {
  BUYER: "BUYER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const EnergyType = {
  SOLAR: "SOLAR",
  WIND: "WIND",
  HYDRO: "HYDRO",
  BIOMASS: "BIOMASS",
  MIXED_RENEWABLE: "MIXED_RENEWABLE",
} as const;
export type EnergyType = (typeof EnergyType)[keyof typeof EnergyType];

export const ListingStatus = {
  ACTIVE: "ACTIVE",
  PARTIALLY_FILLED: "PARTIALLY_FILLED",
  SOLD_OUT: "SOLD_OUT",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
} as const;
export type ListingStatus = (typeof ListingStatus)[keyof typeof ListingStatus];

export const BidStatus = {
  OPEN: "OPEN",
  MATCHED: "MATCHED",
  PARTIALLY_MATCHED: "PARTIALLY_MATCHED",
  EXPIRED: "EXPIRED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;
export type BidStatus = (typeof BidStatus)[keyof typeof BidStatus];

export const MatchStatus = {
  PROPOSED: "PROPOSED",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
  EXPIRED: "EXPIRED",
  SETTLEMENT_PENDING: "SETTLEMENT_PENDING",
  SETTLED: "SETTLED",
  FAILED: "FAILED",
} as const;
export type MatchStatus = (typeof MatchStatus)[keyof typeof MatchStatus];

export const TradeStatus = {
  DRAFT: "DRAFT",
  AWAITING_SIGNATURE: "AWAITING_SIGNATURE",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
  COMPLETED: "COMPLETED",
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];

export const BlockchainTxStatus = {
  WAITING_FOR_SIGNATURE: "WAITING_FOR_SIGNATURE",
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  FAILED: "FAILED",
  REJECTED: "REJECTED",
} as const;
export type BlockchainTxStatus = (typeof BlockchainTxStatus)[keyof typeof BlockchainTxStatus];

export const NotificationType = {
  LISTING_CREATED: "LISTING_CREATED",
  LISTING_UPDATED: "LISTING_UPDATED",
  BID_MATCHED: "BID_MATCHED",
  BID_EXPIRED: "BID_EXPIRED",
  PURCHASE_PENDING: "PURCHASE_PENDING",
  PURCHASE_CONFIRMED: "PURCHASE_CONFIRMED",
  PURCHASE_FAILED: "PURCHASE_FAILED",
  SETTLEMENT_PENDING: "SETTLEMENT_PENDING",
  SETTLEMENT_CONFIRMED: "SETTLEMENT_CONFIRMED",
  SETTLEMENT_FAILED: "SETTLEMENT_FAILED",
  WALLET_CONNECTED: "WALLET_CONNECTED",
  PRICE_CHANGED: "PRICE_CHANGED",
  SYSTEM: "SYSTEM",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const DataQuality = {
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INSUFFICIENT: "INSUFFICIENT",
} as const;
export type DataQuality = (typeof DataQuality)[keyof typeof DataQuality];

export const DataSourceLabel = {
  ACTUAL: "ACTUAL",
  ESTIMATED: "ESTIMATED",
  SIMULATED: "SIMULATED",
} as const;
export type DataSourceLabel = (typeof DataSourceLabel)[keyof typeof DataSourceLabel];

export const AuditAction = {
  USER_REGISTERED: "USER_REGISTERED",
  USER_LOGIN: "USER_LOGIN",
  LISTING_CREATED: "LISTING_CREATED",
  LISTING_UPDATED: "LISTING_UPDATED",
  LISTING_CANCELLED: "LISTING_CANCELLED",
  BID_CREATED: "BID_CREATED",
  BID_CANCELLED: "BID_CANCELLED",
  MATCH_CREATED: "MATCH_CREATED",
  TRADE_SETTLED: "TRADE_SETTLED",
  WALLET_LINKED: "WALLET_LINKED",
  ADMIN_ACTION: "ADMIN_ACTION",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
