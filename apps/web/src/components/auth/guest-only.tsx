"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/lib/auth-store";
import { sanitizeNextPath } from "@/lib/routes";

export function GuestOnly({ children, fallbackPath = "/profile" }: { children: ReactNode; fallbackPath?: string }) {
  const status = useAuthStore((state) => state.status);
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = sanitizeNextPath(searchParams.get("next") ?? fallbackPath);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(destination);
    }
  }, [status, destination, router]);

  if (status === "authenticated") {
    return (
      <div className="flex justify-center py-8">
        <Spinner label="You are already signed in. Redirecting" />
      </div>
    );
  }

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex justify-center py-8">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}
