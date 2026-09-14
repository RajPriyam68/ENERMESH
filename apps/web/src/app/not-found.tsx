import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 px-4 py-24">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-muted">The page you requested is not part of EnerMesh or has moved.</p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </div>
  );
}
