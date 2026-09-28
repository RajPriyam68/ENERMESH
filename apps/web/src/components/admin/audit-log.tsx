"use client";

import type { AuditAction } from "@enermesh/shared";
import { AuditAction as AuditActionEnum } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toAuditLogParams, type AuditLogClientQuery, type AuditLogsResponse } from "@/lib/admin";

const ACTIONS = Object.values(AuditActionEnum);

export function AdminAuditLog() {
  const token = useAuthStore((state) => state.accessToken);
  const [draft, setDraft] = useState({ action: "", entityType: "", userId: "" });
  const [applied, setApplied] = useState<AuditLogClientQuery>({ page: 1, pageSize: 20 });

  const logsQuery = useQuery({
    queryKey: ["admin", "audit", applied],
    enabled: Boolean(token),
    queryFn: async () => apiRequest<AuditLogsResponse>(`/admin/audit-logs${toAuditLogParams(applied)}`, { token }),
  });

  const logs = logsQuery.data?.logs ?? [];

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({
            page: 1,
            pageSize: 20,
            action: (draft.action || undefined) as AuditAction | undefined,
            entityType: draft.entityType.trim() || undefined,
            userId: draft.userId.trim() || undefined,
          });
        }}
      >
        <Field label="Action" htmlFor="auditAction">
          <Select
            id="auditAction"
            value={draft.action}
            onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))}
          >
            <option value="">All actions</option>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Entity type" htmlFor="auditEntity">
          <Input
            id="auditEntity"
            value={draft.entityType}
            onChange={(event) => setDraft((current) => ({ ...current, entityType: event.target.value }))}
          />
        </Field>
        <Field label="User id" htmlFor="auditUserId" hint="UUID filter, optional">
          <Input
            id="auditUserId"
            value={draft.userId}
            onChange={(event) => setDraft((current) => ({ ...current, userId: event.target.value }))}
          />
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({ action: "", entityType: "", userId: "" });
              setApplied({ page: 1, pageSize: 20 });
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {logsQuery.isLoading ? <Spinner label="Loading audit logs" /> : null}
      {logsQuery.isError ? (
        <Alert tone="error" role="alert" title="Could not load audit logs">
          {logsQuery.error instanceof ApiError ? logsQuery.error.message : "Please retry."}
        </Alert>
      ) : null}

      {logsQuery.data && logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No audit rows</p>
          <p className="mt-2 text-sm text-muted">
            This empty table is actual. Logs appear after register, login, listings, bids, settlement, and admin
            actions.
          </p>
        </div>
      ) : null}

      {logs.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Actor</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{log.createdAt.replace("T", " ").slice(0, 19)}</td>
                  <td className="px-3 py-2">{log.action}</td>
                  <td className="px-3 py-2">{log.userEmail ?? "system"}</td>
                  <td className="px-3 py-2">
                    {log.entityType}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ""}
                  </td>
                  <td className="px-3 py-2">{log.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {logsQuery.data && logsQuery.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <p>
            Page {logsQuery.data.page} of {logsQuery.data.totalPages} ({logsQuery.data.total} rows)
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={applied.page === 1}
              onClick={() => setApplied((current) => ({ ...current, page: Math.max(1, (current.page ?? 1) - 1) }))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={(applied.page ?? 1) >= logsQuery.data.totalPages}
              onClick={() => setApplied((current) => ({ ...current, page: (current.page ?? 1) + 1 }))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
