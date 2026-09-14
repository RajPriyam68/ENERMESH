export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await res.json()) as {
    success: boolean;
    data?: T;
    error?: { code: string; message: string };
  };
  if (!res.ok || !body.success || body.data === undefined) {
    throw new ApiError(res.status, body.error?.code ?? "REQUEST_FAILED", body.error?.message ?? "Request failed");
  }
  return body.data;
}
