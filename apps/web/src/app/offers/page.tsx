import type { Metadata } from "next";
import Link from "next/link";
import { RequireRole } from "@/components/auth/require-role";
import { SellerOffers } from "@/components/offers/seller-offers";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My offers — EnerMesh" };

export default function OffersPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <RequireRole roles={["SELLER", "ADMIN"]}>
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">My offers</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Live remaining energy for listings you published. Sold volume is actual matched energy, not a forecast.
            </p>
          </div>
          <Button asChild>
            <Link href="/offers/new">Publish offer</Link>
          </Button>
        </div>
        <SellerOffers />
      </RequireRole>
    </div>
  );
}
