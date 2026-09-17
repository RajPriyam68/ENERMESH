import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/require-auth";
import { SettingsView } from "@/components/auth/settings-view";

export const metadata: Metadata = { title: "Settings — EnerMesh" };

export default function SettingsPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Manage marketplace defaults, notifications, wallet links and your password.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <SettingsView />
        </RequireAuth>
      </div>
    </div>
  );
}
