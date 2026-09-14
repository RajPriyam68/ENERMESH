import type { Metadata } from "next";

export const metadata: Metadata = { title: "Log in — EnerMesh" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-2 text-sm text-muted">
        Authentication ships in Sprint 1. This screen is a placeholder so navigation is complete without
        accepting credentials against an unimplemented API.
      </p>
      <form className="mt-6 space-y-4" aria-disabled="true">
        <label className="block text-sm">
          Email
          <input
            disabled
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            type="email"
            name="email"
            autoComplete="email"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            disabled
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            type="password"
            name="password"
            autoComplete="current-password"
          />
        </label>
        <button
          type="button"
          disabled
          className="h-10 w-full rounded-md bg-primary text-sm text-primary-foreground opacity-50"
        >
          Log in (available in Sprint 1)
        </button>
      </form>
    </div>
  );
}
