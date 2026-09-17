import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { GuestOnly } from "@/components/auth/guest-only";
import { LoginForm } from "@/components/auth/login-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Log in — EnerMesh" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-2 text-sm text-muted">
        Access tokens are held in memory only and refresh tokens live in an httpOnly cookie. Credentials are
        never stored in the browser.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Spinner label="Loading sign-in form" />}>
          <GuestOnly>
            <LoginForm />
          </GuestOnly>
        </Suspense>
      </div>
      <p className="mt-6 text-xs text-muted">
        Forgot your password? Password reset arrives in a later sprint.{" "}
        <Link href="/about" className="text-primary hover:underline">
          Learn more
        </Link>
      </p>
    </div>
  );
}
