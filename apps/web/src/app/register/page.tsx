import type { Metadata } from "next";

export const metadata: Metadata = { title: "Register — EnerMesh" };

export default function RegisterPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="mt-2 text-sm text-muted">
        Buyer and seller registration with JWT sessions arrives in Sprint 1. Roles are never assigned from
        the client alone.
      </p>
      <div className="mt-6 rounded-lg border border-border bg-card p-4 text-sm text-muted">
        Planned roles: Buyer, Seller. Admin accounts are provisioned out-of-band.
      </div>
    </div>
  );
}
