"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NotificationBell } from "@/components/notifications/bell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

export function AuthNav() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();

  if (status === "idle" || status === "loading") {
    return <span className="text-xs text-muted">Checking session…</span>;
  }

  if (status === "authenticated" && user) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden text-right text-xs leading-tight sm:block">
          <p className="font-medium text-foreground">{user.displayName}</p>
          <p className="text-muted">{user.role}</p>
        </div>
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
        <NotificationBell />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/profile">Profile</Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings">Settings</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await logout();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
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
