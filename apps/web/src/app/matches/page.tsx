import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { MatchList } from "@/components/matches/match-list";

export const metadata: Metadata = { title: "Matches — EnerMesh" };

export default function MatchesPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Matches</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Proposed fills from the deterministic matcher. Review a trade, sign in MetaMask, then wait for a receipt. The wallet never marks settlement CONFIRMED.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <MatchList />
        </RequireAuth>
      </div>
    </div>
  );
}
