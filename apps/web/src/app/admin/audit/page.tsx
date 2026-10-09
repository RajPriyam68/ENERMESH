import type { Metadata } from "next";
import { AdminAuditLog } from "@/components/admin/audit-log";
import { RequireRole } from "@/components/auth/require-role";

export const metadata: Metadata = { title: "Audit logs — PeerMatch" };

export default function AdminAuditPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Audit logs</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Read-only AuditLog rows written after validated mutations. Empty filters stay empty; nothing is fabricated.
      </p>
      <div className="mt-8">
        <RequireRole roles={["ADMIN"]} title="Administrator account required">
          <AdminAuditLog />
        </RequireRole>
      </div>
    </div>
  );
}
