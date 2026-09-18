"use client";

import type { UserRole } from "@enermesh/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { RequireAuth } from "@/components/auth/require-auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth-store";

export function RequireRole({
  roles,
  children,
  title = "Account role required",
  message,
}: {
  roles: UserRole[];
  children: ReactNode;
  title?: string;
  message?: string;
}) {
  return (
    <RequireAuth>
      <RoleGate roles={roles} title={title} message={message}>
        {children}
      </RoleGate>
    </RequireAuth>
  );
}

function RoleGate({
  roles,
  children,
  title,
  message,
}: {
  roles: UserRole[];
  children: ReactNode;
  title: string;
  message?: string;
}) {
  const user = useAuthStore((state) => state.user);
  if (!user) return null;
  if (roles.includes(user.role)) return <>{children}</>;

  return (
    <div className="space-y-4">
      <Alert tone="error" role="alert" title={title}>
        {message ?? `This page is limited to ${roles.join(" or ")} accounts. Your current role is ${user.role}.`}
      </Alert>
      <Button variant="outline" asChild>
        <Link href="/marketplace">Back to marketplace</Link>
      </Button>
    </div>
  );
}
