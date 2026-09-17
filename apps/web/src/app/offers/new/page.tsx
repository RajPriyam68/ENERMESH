import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/require-role";
import { OfferForm } from "@/components/offers/offer-form";

export const metadata: Metadata = { title: "Publish offer — EnerMesh" };

export default function NewOfferPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <RequireRole roles={["SELLER", "ADMIN"]}>
        <h1 className="text-3xl font-semibold">Publish offer</h1>
        <p className="mt-2 text-sm text-muted">
          A verified wallet is required. Available kWh is remaining energy; sold kWh is never entered by you.
        </p>
        <div className="mt-8">
          <OfferForm />
        </div>
      </RequireRole>
    </div>
  );
}
