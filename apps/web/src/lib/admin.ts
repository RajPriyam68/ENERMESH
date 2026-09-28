import type {
  AdminUserPublic,
  AuditAction,
  AuditLogPublic,
  EnergyType,
  MarketplaceReport,
  SettlementReport,
  TelemetryReport,
  UserRole,
} from "@enermesh/shared";

export interface AdminUsersResponse {
  users: AdminUserPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AuditLogsResponse {
  logs: AuditLogPublic[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminUserQuery {
  page?: number;
  pageSize?: number;
  role?: UserRole;
  isActive?: boolean;
  q?: string;
}

export interface AuditLogClientQuery {
  page?: number;
  pageSize?: number;
  action?: AuditAction;
  entityType?: string;
  userId?: string;
}

export interface ReportClientQuery {
  energyType?: EnergyType;
  marketZone?: string;
}

export interface MarketplaceReportResponse {
  report: MarketplaceReport;
}

export interface SettlementReportResponse {
  report: SettlementReport;
}

export interface TelemetryReportResponse {
  report: TelemetryReport;
}

function toSearchParams(query: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function toAdminUserParams(query: AdminUserQuery): string {
  return toSearchParams({
    page: query.page,
    pageSize: query.pageSize,
    role: query.role,
    isActive: query.isActive,
    q: query.q,
  });
}

export function toAuditLogParams(query: AuditLogClientQuery): string {
  return toSearchParams({
    page: query.page,
    pageSize: query.pageSize,
    action: query.action,
    entityType: query.entityType,
    userId: query.userId,
  });
}

export function toReportParams(query: ReportClientQuery): string {
  return toSearchParams({
    energyType: query.energyType,
    marketZone: query.marketZone,
  });
}
