"use client";

import type { NotificationPublic } from "@enermesh/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

interface NotificationListResponse {
  notifications: NotificationPublic[];
  unreadCount: number;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function NotificationInbox() {
  const token = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["notifications", "mine"],
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<NotificationListResponse>("/notifications?pageSize=50&sortOrder=desc", { token }),
  });

  const readOne = useMutation({
    mutationFn: (id: string) =>
      apiRequest<{ notification: NotificationPublic }>(`/notifications/${id}/read`, { method: "POST", token }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : "Unable to mark this notification as read.");
    },
  });

  const readAll = useMutation({
    mutationFn: () => apiRequest<{ updated: number }>("/notifications/read-all", { method: "POST", token }),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      setActionError(error instanceof ApiError ? error.message : "Unable to mark notifications as read.");
    },
  });

  if (query.isLoading) return <Spinner label="Loading notifications" />;
  if (query.isError) {
    return (
      <Alert tone="error" role="alert" title="Could not load notifications">
        {query.error instanceof ApiError ? query.error.message : "Please retry."}
      </Alert>
    );
  }

  const notifications = query.data?.notifications ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      {actionError ? (
        <Alert tone="error" role="alert" title="Update failed">
          {actionError}
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {unreadCount === 0 ? "No unread notifications" : `${unreadCount} unread`}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={unreadCount === 0 || readAll.isPending}
          onClick={() => readAll.mutate()}
        >
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <p className="font-medium">No notifications yet</p>
          <p className="mt-2 text-sm text-muted">
            Alerts appear after real listing, bid, match, or verified trade changes. This list is never seeded.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((item) => (
            <li key={item.id} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">
                {item.type.replaceAll("_", " ")}
                {item.readAt ? "" : " · unread"}
              </p>
              <p className="mt-1 font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-muted">{item.body}</p>
              <p className="mt-2 text-xs text-muted">{new Date(item.createdAt).toLocaleString()}</p>
              {!item.readAt ? (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="outline"
                  disabled={readOne.isPending}
                  onClick={() => readOne.mutate(item.id)}
                >
                  Mark read
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
