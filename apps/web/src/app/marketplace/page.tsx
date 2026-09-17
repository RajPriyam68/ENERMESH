import type { Metadata } from "next";
import { MarketplaceCatalog } from "@/components/marketplace/catalog";

export const metadata: Metadata = {
  title: "Marketplace — EnerMesh",
};

export default function MarketplacePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <MarketplaceCatalog />
    </div>
  );
}
