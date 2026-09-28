"use client";

import type { UserRole } from "@enermesh/shared";
import { UserRole as UserRoleEnum } from "@enermesh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { toAdminUserParams, type AdminUserQuery, type AdminUsersResponse } from "@/lib/admin";

const ROLES = Object.values(UserRoleEnum);

export function AdminUserTable() {
  const token = useAuthStore((state) => state.accessToken);
  const selfId = useAuthStore((state) => state.user?.id);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<{ q: string; role: string; isActive: string }>({
    q: "",
    role: "",
    isActive: "",
  });
  const [applied, setApplied] = useState<AdminUserQuery>({ page: 1, pageSize: 20 });

  const usersQuery = useQuery({
    queryKey: ["admin", "users", applied],
    enabled: Boolean(token),
    queryFn: async () => apiRequest<AdminUsersResponse>(`/admin/users${toAdminUserParams(applied)}`, { token }),
  });

  const patchMutation = useMutation({
    mutationFn: async (input: { id: string; isActive: boolean }) => {
      return apiRequest<{ user: AdminUsersResponse["users"][number] }>(`/admin/users/${input.id}`, {
        method: "PATCH",
        token,
        body: { isActive: input.isActive },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
  });

  const users = usersQuery.data?.users ?? [];

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({
            page: 1,
            pageSize: 20,
            q: draft.q.trim() || undefined,
            role: (draft.role || undefined) as UserRole | undefined,
            isActive: draft.isActive === "" ? undefined : draft.isActive === "true",
          });
        }}
      >
        <Field label="Search" htmlFor="adminUserQ">
          <Input
            id="adminUserQ"
            value={draft.q}
            onChange={(event) => setDraft((current) => ({ ...current, q: event.target.value }))}
          />
        </Field>
        <Field label="Role" htmlFor="adminUserRole">
          <Select
            id="adminUserRole"
            value={draft.role}
            onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" htmlFor="adminUserActive">
          <Select
            id="adminUserActive"
            value={draft.isActive}
            onChange={(event) => setDraft((current) => ({ ...current, isActive: event.target.value }))}
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Disabled</option>
          </Select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDraft({ q: "", role: "", isActive: "" });
              setApplied({ page: 1, pageSize: 20 });
            }}
          >
            Reset
          </Button>
        </div>
      </form>

      {usersQuery.isLoading ? <Spinner label="Loading users" /> : null}
      {usersQuery.isError ? (
        <Alert tone="error" role="alert" title="Could not load users">
          {usersQuery.error instanceof ApiError ? usersQuery.error.message : "Please retry."}
        </Alert>
      ) : null}
      {patchMutation.isError ? (
        <Alert tone="error" role="alert" title="Could not update user">
          {patchMutation.error instanceof ApiError ? patchMutation.error.message : "Please retry."}
        </Alert>
      ) : null}

      {usersQuery.data && users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No users match these filters</p>
          <p className="mt-2 text-sm text-muted">This empty list is actual, not a sample directory.</p>
        </div>
      ) : null}

      {users.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-card text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-border">
                  <td className="px-3 py-2">{user.displayName}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">{user.role}</td>
                  <td className="px-3 py-2">{user.isActive ? "Active" : "Disabled"}</td>
                  <td className="px-3 py-2">{user.createdAt.slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    {user.id === selfId ? (
                      <span className="text-xs text-muted">Current account</span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={patchMutation.isPending}
                        onClick={() => patchMutation.mutate({ id: user.id, isActive: !user.isActive })}
                      >
                        {user.isActive ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {usersQuery.data && usersQuery.data.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted">
          <p>
            Page {usersQuery.data.page} of {usersQuery.data.totalPages} ({usersQuery.data.total} users)
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
              disabled={(applied.page ?? 1) >= usersQuery.data.totalPages}
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
