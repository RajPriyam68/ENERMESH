import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/require-role";
import { PlaceBidForm } from "@/components/bids/place-bid-form";

export const metadata: Metadata = { title: "Place bid — EnerMesh" };

export default function NewBidPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <RequireRole roles={["BUYER", "ADMIN"]} title="Buyer account required">
        <h1 className="text-3xl font-semibold">Place bid</h1>
        <p className="mt-2 text-sm text-muted">
          Open-market bids match the cheapest compatible listings first. Partial fills are required when only part of the energy is available.
        </p>
        <div className="mt-8">
          <PlaceBidForm />
        </div>
      </RequireRole>
    </div>
  );
}
