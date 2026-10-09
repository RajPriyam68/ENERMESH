import type { Metadata } from "next";
import { AdminUserTable } from "@/components/admin/user-table";
import { RequireRole } from "@/components/auth/require-role";

export const metadata: Metadata = { title: "Admin users — PeerMatch" };

export default function AdminUsersPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Users</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        ADMIN-only directory from live User rows. Disable revokes refresh sessions. Role is never assigned through
        public registration; seed the first admin out-of-band.
      </p>
      <div className="mt-8">
        <RequireRole roles={["ADMIN"]} title="Administrator account required">
          <AdminUserTable />
        </RequireRole>
      </div>
    </div>
  );
}
