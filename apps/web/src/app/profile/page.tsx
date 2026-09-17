import type { Metadata } from "next";
import { ProfileView } from "@/components/auth/profile-view";
import { RequireAuth } from "@/components/auth/require-auth";

export const metadata: Metadata = { title: "Profile — EnerMesh" };

export default function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-semibold">Profile</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Keep your contact details current so counterparties can coordinate delivery. Only your display name is
        visible in the marketplace.
      </p>
      <div className="mt-8">
        <RequireAuth>
          <ProfileView />
        </RequireAuth>
      </div>
    </div>
  );
}
