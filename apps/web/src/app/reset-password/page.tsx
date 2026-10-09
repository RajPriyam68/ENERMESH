import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestOnly } from "@/components/auth/guest-only";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Reset password — EnerMesh" };

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted">
        Use the single-use link from your email. After the password is updated you will need to sign in again.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Spinner label="Loading password reset form" />}>
          <GuestOnly>
            <ResetPasswordForm />
          </GuestOnly>
        </Suspense>
      </div>
    </div>
  );
}
