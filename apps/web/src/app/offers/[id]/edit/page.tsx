import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/require-role";
import { EditOffer } from "@/components/offers/edit-offer";

export const metadata: Metadata = { title: "Edit offer — EnerMesh" };

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <RequireRole roles={["SELLER", "ADMIN"]}>
        <h1 className="text-3xl font-semibold">Edit offer</h1>
        <p className="mt-2 text-sm text-muted">
          Changing available kWh adjusts remaining energy only. Sold volume cannot be invented from this form.
        </p>
        <div className="mt-8">
          <EditOffer listingId={id} />
        </div>
      </RequireRole>
    </div>
  );
}
