import type { Metadata } from "next";
import { AdminReports } from "@/components/admin/reports";
import { RequireRole } from "@/components/auth/require-role";

export const metadata: Metadata = { title: "Reports — EnerMesh" };

export default function AdminReportsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Reports</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Platform marketplace, settlement, and telemetry reports from Prisma. Confirmed volume stays labelled ACTUAL.
        Empty books remain 0.
      </p>
      <div className="mt-8">
        <RequireRole roles={["ADMIN"]} title="Administrator account required">
          <AdminReports />
        </RequireRole>
      </div>
    </div>
  );
}
