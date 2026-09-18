const DEFAULT_AUTHENTICATED_PATH = "/marketplace";

/**
 * Only same-site absolute paths are accepted as post-login destinations.
 * Protocol-relative and external URLs are dropped to prevent open redirects.
 */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AUTHENTICATED_PATH;
  if (!next.startsWith("/")) return DEFAULT_AUTHENTICATED_PATH;
  if (next.startsWith("//") || next.startsWith("/\\")) return DEFAULT_AUTHENTICATED_PATH;
  if (next.includes("\\") || next.includes("\n") || next.includes("\r")) {
    return DEFAULT_AUTHENTICATED_PATH;
  }
  return next;
}

export function loginHref(nextPath?: string): string {
  if (!nextPath) return "/login";
  return `/login?next=${encodeURIComponent(sanitizeNextPath(nextPath))}`;
}

export const PROTECTED_PATHS = ["/profile", "/settings", "/offers", "/bids", "/matches"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}
