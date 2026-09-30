-- CreateIndex
-- Unfiltered GET /admin/audit-logs ORDER BY createdAt DESC was a sequential
-- top-N heapsort on 3394 rows (EXPLAIN ANALYZE ~4.7ms). Filter-by-action
-- already used AuditLog_action_createdAt_idx (~0.15ms).
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
