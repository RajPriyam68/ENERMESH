import type { Metadata } from "next";
import { Suspense } from "react";
import { GuestOnly } from "@/components/auth/guest-only";
import { RegisterForm } from "@/components/auth/register-form";
import { Spinner } from "@/components/ui/spinner";

export const metadata: Metadata = { title: "Register — EnerMesh" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="mt-2 text-sm text-muted">
        Choose buyer or seller. Roles are validated on the server; admin accounts are never self-assigned.
      </p>
      <div className="mt-6">
        <Suspense fallback={<Spinner label="Loading registration form" />}>
          <GuestOnly fallbackPath="/profile">
            <RegisterForm />
          </GuestOnly>
        </Suspense>
      </div>
    </div>
  );
}
