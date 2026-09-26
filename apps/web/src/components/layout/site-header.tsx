import Link from "next/link";
import { AuthNav } from "@/components/layout/auth-nav";

const nav = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/advisor", label: "Advisor" },
  { href: "/about", label: "About" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-semibold tracking-tight text-primary">
          EnerMesh
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex" aria-label="Primary">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <AuthNav />
      </div>
    </header>
  );
}
