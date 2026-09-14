import { Hero } from "@/components/landing/hero";
import { apiGet } from "@/lib/api";

interface Health {
  status: string;
  sprint: string;
  timestamp: string;
}

async function loadHealth(): Promise<Health | null> {
  try {
    return await apiGet<Health>("/health");
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await loadHealth();

  return (
    <>
      <Hero />
      <section className="mx-auto w-full max-w-6xl space-y-10 px-4 py-12">
        <div>
          <h2 className="text-xl font-semibold">Why EnerMesh</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <article className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-medium">Transparent matching</h3>
              <p className="mt-2 text-sm text-muted">
                Deterministic rules: compatible price, type, zone, overlapping availability, and partial fills.
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-medium">Verifiable settlement</h3>
              <p className="mt-2 text-sm text-muted">
                Trades become confirmed only after backend receipt and event verification on the configured network.
              </p>
            </article>
            <article className="rounded-lg border border-border bg-card p-5">
              <h3 className="font-medium">Trust without overselling</h3>
              <p className="mt-2 text-sm text-muted">
                Quantity constraints, idempotent settlement, and wallet signature checks run on the server, not the UI.
              </p>
            </article>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">Platform status</h2>
          <p className="mt-1 text-sm text-muted">Live from the API. Empty or unavailable values are labelled, never invented.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">API</p>
              <p className="mt-1 font-medium">{health ? health.status : "Unavailable"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Sprint</p>
              <p className="mt-1 font-medium">{health?.sprint ?? "Unknown"}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Marketplace volume</p>
              <p className="mt-1 font-medium">No trades yet (actual)</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-semibold">FAQ</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div>
              <dt className="font-medium">Does blockchain move electricity?</dt>
              <dd className="text-muted">No. It stores independently verifiable digital evidence of agreed energy trades.</dd>
            </div>
            <div>
              <dt className="font-medium">Can I trade without an AI key?</dt>
              <dd className="text-muted">Yes. Matching, settlement, and dashboards work without optional AI providers.</dd>
            </div>
            <div>
              <dt className="font-medium">What happens if a wallet rejects a transaction?</dt>
              <dd className="text-muted">The UI shows rejected status. Success is never shown before backend verification.</dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
