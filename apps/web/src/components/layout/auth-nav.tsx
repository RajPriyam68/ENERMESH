"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NotificationBell } from "@/components/notifications/bell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

export function AuthNav() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  if (status === "idle" || status === "loading") {
    return <span className="text-xs text-muted">Checking session…</span>;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <div className="min-w-0 text-right text-xs leading-tight">
          <p className="truncate font-medium text-foreground">{user.displayName}</p>
          <p className="text-muted">{user.role}</p>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          {user.role === "SELLER" || user.role === "ADMIN" ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/offers">Offers</Link>
            </Button>
          ) : null}
          {user.role === "BUYER" || user.role === "ADMIN" ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/bids">Bids</Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/matches">Matches</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/advisor">Advisor</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/telemetry">Telemetry</Link>
          </Button>
          {user.role === "ADMIN" ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin">Users</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/audit">Audit</Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/admin/reports">Reports</Link>
              </Button>
            </>
          ) : null}
        </div>
        <NotificationBell />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/profile">Profile</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Settings</Link>
        </Button>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={pending}
            aria-busy={pending}
            onClick={async () => {
              if (pending) return;
              setPending(true);
              setLogoutError(null);
              try {
                await logout();
                router.replace("/login");
              } catch (error) {
                setLogoutError(error instanceof Error ? error.message : "Unable to log out. Try again.");
                setPending(false);
              }
            }}
          >
            {pending ? "Logging out..." : "Logout"}
          </Button>
          {logoutError ? (
            <p className="max-w-[10rem] text-right text-xs text-danger" role="alert">
              {logoutError}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <Link href="/login">Log in</Link>
      </Button>
      <Button size="sm" asChild>
        <Link href="/register">Register</Link>
      </Button>
    </div>
  );
}
