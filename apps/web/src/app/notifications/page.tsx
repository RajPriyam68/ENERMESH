import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { NotificationInbox } from "@/components/notifications/inbox";

export const metadata: Metadata = { title: "Notifications — EnerMesh" };

export default function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Notifications</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        In-app alerts after validated listing, bid, match, and trade writes. Socket.IO is a hint to refresh; REST remains the source of truth.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <NotificationInbox />
        </RequireAuth>
      </div>
    </div>
  );
}
