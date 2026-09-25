import type { Metadata } from "next";
import { AnalyticsDashboard } from "@/components/analytics/dashboard";
import { RequireAuth } from "@/components/auth/require-auth";

export const metadata: Metadata = { title: "Dashboard — EnerMesh" };

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Analytics</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Confirmed trades, live remaining supply, and unmatched demand. Estimated carbon savings are labelled.
        Nothing is mocked when the book is empty.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <AnalyticsDashboard />
        </RequireAuth>
      </div>
    </div>
  );
}
