import type { Metadata } from "next";
import { ListingDetail } from "@/components/marketplace/listing-detail";

export const metadata: Metadata = { title: "Listing — EnerMesh" };

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <ListingDetail listingId={id} />
    </div>
  );
}
