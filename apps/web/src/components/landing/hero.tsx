import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="border-b border-border bg-card">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 md:grid-cols-[1.2fr_0.8fr] md:items-center">
        <div className="space-y-5">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">P2P renewable energy marketplace</p>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-5xl">
            Trade Renewable Energy Directly.
          </h1>
          <p className="max-w-xl text-muted">
            EnerMesh matches surplus solar, wind, and other renewables to local demand with deterministic
            matching and independently verifiable blockchain settlement. Blockchain records digital trade
            evidence — not physical electricity.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/marketplace">Browse marketplace</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/register">List surplus energy</Link>
            </Button>
          </div>
        </div>
        <ol className="space-y-3 rounded-lg border border-border bg-background p-5 text-sm">
          <li>
            <strong className="text-foreground">1. List</strong>
            <p className="text-muted">Sellers publish available kWh, price, zone, and window.</p>
          </li>
          <li>
            <strong className="text-foreground">2. Match</strong>
            <p className="text-muted">Backend matching enforces price, quantity, type, zone, and time overlap.</p>
          </li>
          <li>
            <strong className="text-foreground">3. Confirm</strong>
            <p className="text-muted">Buyers review quantity, price, wallet, and network before signing.</p>
          </li>
          <li>
            <strong className="text-foreground">4. Blockchain settlement</strong>
            <p className="text-muted">Polygon receipt is verified by the API before the trade is marked confirmed.</p>
          </li>
        </ol>
      </div>
    </section>
  );
}
