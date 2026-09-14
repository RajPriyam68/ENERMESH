import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>EnerMesh — Connect Energy. Match Demand. Trade with Trust.</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/marketplace" className="hover:text-foreground">
            Marketplace
          </Link>
          <a href="/api/v1/health" className="hover:text-foreground">
            API health
          </a>
        </div>
      </div>
    </footer>
  );
}
