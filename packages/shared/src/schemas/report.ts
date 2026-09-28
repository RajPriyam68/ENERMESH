import { analyticsQuerySchema, type AnalyticsQuery } from "./analytics.js";

export const reportQuerySchema = analyticsQuerySchema;

export type ReportQuery = AnalyticsQuery;
