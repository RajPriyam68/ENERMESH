"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { RealtimeBridge } from "@/components/realtime/realtime-bridge";
import { useAuthStore } from "@/lib/auth-store";

const REFRESH_LEAD_MS = 60_000;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  const bootstrap = useAuthStore((state) => state.bootstrap);
  const refresh = useAuthStore((state) => state.refresh);
  const status = useAuthStore((state) => state.status);
  const accessExpiresAt = useAuthStore((state) => state.accessExpiresAt);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // Refresh shortly before the access token expires so sessions survive navigation.
  useEffect(() => {
    if (status !== "authenticated" || !accessExpiresAt) return;
    const delay = Math.max(new Date(accessExpiresAt).getTime() - Date.now() - REFRESH_LEAD_MS, 5_000);
    const timer = window.setTimeout(() => {
      void refresh();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [status, accessExpiresAt, refresh]);

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      {children}
    </QueryClientProvider>
  );
}
