import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { EnergyHistoryPanel } from "@/components/iot/energy-history";

export const metadata: Metadata = { title: "Telemetry — EnerMesh" };

export default function TelemetryPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Energy history</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Labelled meter samples from HTTP ingest or the simulated adapter. Simulated rows stay SIMULATED. This page
        never invents marketplace volume or marks a trade confirmed.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <EnergyHistoryPanel />
        </RequireAuth>
      </div>
    </div>
  );
}
