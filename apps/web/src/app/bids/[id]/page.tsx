import type { Metadata } from "next";
import { RequireRole } from "@/components/auth/require-role";
import { BidDetail } from "@/components/bids/bid-detail";

export const metadata: Metadata = { title: "Bid — EnerMesh" };

export default async function BidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <RequireRole roles={["BUYER", "ADMIN"]} title="Buyer account required">
        <BidDetail bidId={id} />
      </RequireRole>
    </div>
  );
}
