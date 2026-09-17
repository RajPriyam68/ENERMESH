export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  retryOnUnauthorized?: boolean;
}

/**
 * Single entry point for API calls. `credentials: include` lets the httpOnly
 * refresh cookie flow through the same-origin rewrite; the access token is
 * passed explicitly and never persisted to storage.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "include",
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "NETWORK_ERROR", "Unable to reach the EnerMesh API. Check your connection.");
  }

  const text = await res.text();
  const envelope = (text ? JSON.parse(text) : { success: false }) as Envelope<T>;

  if (!res.ok || !envelope.success) {
    const error = new ApiError(
      res.status,
      envelope.error?.code ?? "REQUEST_FAILED",
      envelope.error?.message ?? "Request failed",
      envelope.error?.details,
    );

    const canRetry =
      options.retryOnUnauthorized !== false &&
      res.status === 401 &&
      Boolean(options.token) &&
      !path.startsWith("/auth/");

    if (canRetry) {
      const { useAuthStore } = await import("./auth-store");
      await useAuthStore.getState().refresh();
      const nextToken = useAuthStore.getState().accessToken;
      if (nextToken && nextToken !== options.token) {
        return apiRequest<T>(path, { ...options, token: nextToken, retryOnUnauthorized: false });
      }
    }

    throw error;
  }
  return envelope.data as T;
}

export async function apiGet<T>(path: string, token?: string | null): Promise<T> {
  return apiRequest<T>(path, { token });
}
