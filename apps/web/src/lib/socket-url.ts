/**
 * Browser Socket.IO target. Empty / relative values stay same-origin so the
 * Next.js rewrite can proxy `/socket.io` to the API. Absolute http(s) URLs
 * are used only when the API is on a different origin.
 */
export function resolveSocketUrl(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return undefined;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    return undefined;
  }
  return undefined;
}
