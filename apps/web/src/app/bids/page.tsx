import type { Metadata } from "next";
import Link from "next/link";
import { RequireRole } from "@/components/auth/require-role";
import { BuyerBids } from "@/components/bids/buyer-bids";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "My bids — EnerMesh" };

export default function BidsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <RequireRole roles={["BUYER", "ADMIN"]} title="Buyer account required" message="Placing and reviewing bids is limited to buyer accounts.">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">My bids</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Matched kWh is actual fill from the matcher. Unmatched demand stays unmatched — nothing is forecasted.
            </p>
          </div>
          <Button asChild>
            <Link href="/bids/new">New bid</Link>
          </Button>
        </div>
        <BuyerBids />
      </RequireRole>
    </div>
  );
}
