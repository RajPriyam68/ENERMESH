"use client";

import type { NotificationPublic } from "@enermesh/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { useRealtimeStore } from "@/lib/realtime-store";

interface NotificationListResponse {
  notifications: NotificationPublic[];
  unreadCount: number;
}

export function NotificationBell() {
  const token = useAuthStore((state) => state.accessToken);
  const realtime = useRealtimeStore((state) => state.status);
  const query = useQuery({
    queryKey: ["notifications", "preview"],
    enabled: Boolean(token),
    queryFn: () =>
      apiRequest<NotificationListResponse>("/notifications?pageSize=1&sortOrder=desc", { token }),
  });

  const unread = query.data?.unreadCount ?? 0;
  const liveLabel =
    realtime === "connected"
      ? "Live"
      : realtime === "connecting"
        ? "Connecting"
        : realtime === "error"
          ? "Realtime error"
          : realtime === "disconnected"
            ? "Reconnecting"
            : "Offline";

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted sm:inline" role="status">
        {liveLabel}
      </span>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/notifications">
          Inbox{unread > 0 ? ` (${unread})` : ""}
        </Link>
      </Button>
    </div>
  );
}
