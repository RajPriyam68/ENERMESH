process.env.NODE_ENV = "test";
process.env.BCRYPT_ROUNDS = "10";

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const { createApp } = await import("../app.js");
const { prisma, pingDatabase } = await import("../lib/prisma.js");
const { toPublicUser } = await import("../services/auth.service.js");

export { prisma, pingDatabase, toPublicUser };

export function uniqueEmail(prefix: string): string {
  return `${prefix}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}@example.test`;
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const app = createApp();
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

export interface ApiResponse<T = unknown> {
  status: number;
  body: {
    success: boolean;
    data?: T;
    meta?: { page?: number; pageSize?: number; total?: number; totalPages?: number };
    error?: { code: string; message: string };
  };
  setCookie: string[];
}

export async function api<T = unknown>(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string; cookie?: string } = {},
): Promise<ApiResponse<T>> {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json");
  if (init.token) headers.set("authorization", `Bearer ${init.token}`);
  if (init.cookie) headers.set("cookie", init.cookie);
  const res = await fetch(`${baseUrl}/api/v1${path}`, { ...init, headers });
  const text = await res.text();
  const body = (text ? JSON.parse(text) : { success: false }) as ApiResponse<T>["body"];
  const rawCookie = res.headers.get("set-cookie");
  const setCookie = rawCookie ? rawCookie.split(/,(?=[^;]+=[^;]+)/).map((c) => c.trim()) : [];
  return { status: res.status, body, setCookie };
}
