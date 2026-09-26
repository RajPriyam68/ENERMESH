export const API_PREFIX = "/api/v1";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const ENERGY_UNITS = {
  kWh: "kWh",
} as const;

export const SUPPORTED_CHAIN_IDS = {
  POLYGON_AMOY: 80002,
} as const;

export const MATCHING_PRIORITY = [
  "price",
  "energyType",
  "marketZone",
  "availabilityOverlap",
  "bestPrice",
  "earliestValidOrder",
] as const;

export const SOCKET_EVENTS = {
  listingCreated: "listing:created",
  listingUpdated: "listing:updated",
  listingExpired: "listing:expired",
  bidCreated: "bid:created",
  bidUpdated: "bid:updated",
  bidMatched: "bid:matched",
  bidExpired: "bid:expired",
  matchCreated: "match:created",
  matchUpdated: "match:updated",
  tradePending: "trade:pending",
  tradeConfirmed: "trade:confirmed",
  tradeFailed: "trade:failed",
  notificationNew: "notification:new",
  dashboardUpdated: "dashboard:updated",
  energyUpdated: "energy:updated",
} as const;

export const RESEARCH_QUESTION =
  "How can a renewable-energy marketplace efficiently match decentralized energy supply and demand while providing transparent and independently verifiable digital trade settlement?";

export const ESTIMATED_GRID_KG_CO2_PER_KWH = 0.4;
