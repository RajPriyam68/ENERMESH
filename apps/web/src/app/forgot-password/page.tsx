import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestOnly } from "@/components/auth/guest-only";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Forgot password — EnerMesh" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter the email on your account. If it matches an EnerMesh account, we will send a single-use reset link
        that expires shortly.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Spinner label="Loading password reset form" />}>
          <GuestOnly>
            <ForgotPasswordForm />
          </GuestOnly>
        </Suspense>
      </div>
    </div>
  );
}
