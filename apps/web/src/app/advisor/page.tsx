import type { Metadata } from "next";
import { AdvisorPanel } from "@/components/ai/advisor-panel";
import { RequireAuth } from "@/components/auth/require-auth";

export const metadata: Metadata = { title: "Advisor — EnerMesh" };

export default function AdvisorPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold">EnergyTech advisor</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Optional explanations of labelled S6 facts. The advisor cannot execute trades, sign wallets, or mark a
        trade confirmed. Matching and settlement work without a provider key.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <AdvisorPanel heading="Ask about your book" />
        </RequireAuth>
      </div>
    </div>
  );
}
