import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Marketplace — EnerMesh",
};

export default function MarketplacePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Marketplace</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Live offers will appear here after Sprint 2. Nothing is mocked. When the catalog is empty, this
        empty state is shown instead of sample cards.
      </p>
      <div className="mt-8 rounded-lg border border-dashed border-border bg-card p-8 text-center">
        <p className="font-medium">No active listings</p>
        <p className="mt-2 text-sm text-muted">
          Sellers can publish surplus energy after authentication and wallet verification are enabled in Sprint 1–2.
        </p>
        <Button className="mt-4" asChild>
          <Link href="/register">Create seller account</Link>
        </Button>
      </div>
    </div>
  );
}
