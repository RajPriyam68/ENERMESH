import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import express from "express";
import type { Env } from "../config/env.js";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const { createApp } = await import("../app.js");
const { assertProductionSecrets } = await import("../config/env.js");
const { createLimiter } = await import("../lib/rateLimit.js");
const { errorHandler, HttpError } = await import("../middleware/errorHandler.js");
const { hashPassword } = await import("../lib/password.js");
const { signAccessToken } = await import("../lib/jwt.js");
const { patchAdminUser } = await import("../services/admin.service.js");

const dbReady = await pingDatabase();
const server = await startTestServer();
const createdUserIds: string[] = [];

after(async () => {
  if (dbReady) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await server.close();
  await prisma.$disconnect();
});

function productionEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "production",
    API_HOST: "0.0.0.0",
    API_PORT: 3001,
    API_PUBLIC_URL: "http://localhost:3001",
    WEB_ORIGIN: "https://app.example",
    LOG_LEVEL: "info",
    TRUST_PROXY: "false",
    DATABASE_URL: "postgresql://enermesh:enermesh@localhost:5432/enermesh",
    JWT_ACCESS_SECRET: "production-access-secret-value-32",
    JWT_REFRESH_SECRET: "production-refresh-secret-value-32",
    JWT_ACCESS_EXPIRES_IN: "15m",
    JWT_REFRESH_EXPIRES_IN: "7d",
    BCRYPT_ROUNDS: 12,
    CHAIN_ID: 80002,
    CHAIN_NAME: "polygon-amoy",
    RPC_URL: "https://rpc-amoy.polygon.technology",
    BLOCK_EXPLORER_URL: "https://amoy.polygonscan.com",
    CONTRACT_ADDRESS: "",
    SOCKET_PATH: "/socket.io",
    SOCKET_CORS_ORIGIN: "https://app.example",
    USER_LLM_API_KEY: "",
    USER_LLM_BASE_URL: "",
    USER_LLM_MODEL: "",
    USER_LLM_PROVIDER: "",
    MQTT_URL: "",
    MQTT_USERNAME: "",
    MQTT_PASSWORD: "",
    SMTP_URL: "",
    SMTP_FROM: "EnerMesh <noreply@localhost>",
    PASSWORD_RESET_TTL_MINUTES: 60,
    PASSWORD_RESET_APP_URL: "",
    ...overrides,
  };
}

describe("security headers and CORS", () => {
  it("sets nosniff, frame deny, and no-referrer on health", async () => {
    const app = createApp();
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`);
    http.close();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-frame-options"), "DENY");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  it("does not reflect an unlisted CORS origin", async () => {
    const app = createApp();
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}/api/v1/health`, {
      headers: { Origin: "https://evil.example" },
    });
    http.close();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});

describe("error leakage and malformed payloads", () => {
  it("maps invalid JSON to 400 INVALID_JSON without leaking parse internals", async () => {
    const res = await fetch(`${server.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not-json",
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    assert.equal(res.status, 400);
    assert.equal(body.error?.code, "INVALID_JSON");
    assert.equal(body.error?.message, "Request body must be valid JSON");
  });

  it("hides unexpected error messages even outside production", async () => {
    const app = express();
    app.get("/boom", (_req, _res, next) => next(new Error("secret stack detail")));
    app.use(errorHandler);
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}/boom`);
    const body = (await res.json()) as { success: boolean; error?: { code: string; message: string } };
    http.close();
    assert.equal(res.status, 500);
    assert.equal(body.error?.code, "INTERNAL_ERROR");
    assert.equal(body.error?.message, "An unexpected error occurred");
    assert.equal(JSON.stringify(body).includes("secret stack detail"), false);
  });

  it("still surfaces HttpError codes to clients", async () => {
    const app = express();
    app.get("/denied", (_req, _res, next) => next(new HttpError(403, "FORBIDDEN", "You do not have permission")));
    app.use(errorHandler);
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const res = await fetch(`http://127.0.0.1:${address.port}/denied`);
    const body = (await res.json()) as { error?: { code: string } };
    http.close();
    assert.equal(res.status, 403);
    assert.equal(body.error?.code, "FORBIDDEN");
  });
});

describe("rate limiter", () => {
  it("returns 429 RATE_LIMITED after the configured limit", async () => {
    const app = express();
    app.use(
      createLimiter({
        windowMs: 60_000,
        limit: 2,
        message: "Too many requests. Try again shortly.",
        skip: () => false,
      }),
    );
    app.get("/limited", (_req, res) => res.json({ success: true }));
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/limited`;
    const first = await fetch(url);
    const second = await fetch(url);
    const third = await fetch(url);
    const body = (await third.json()) as { success: boolean; error?: { code: string } };
    http.close();
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(third.status, 429);
    assert.equal(body.error?.code, "RATE_LIMITED");
  });

  it("rate-limits password reset requests after five attempts per minute", async () => {
    const app = express();
    app.use(
      createLimiter({
        windowMs: 60_000,
        limit: 5,
        message: "Too many password reset attempts. Try again shortly.",
        skip: () => false,
      }),
    );
    app.post("/forgot", (_req, res) => res.json({ success: true }));
    const http = app.listen(0);
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const url = `http://127.0.0.1:${address.port}/forgot`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await fetch(url, { method: "POST" });
      statuses.push(res.status);
    }
    http.close();
    assert.deepEqual(statuses.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(statuses[5], 429);
  });
});

describe("production secrets", () => {
  it("rejects default and short JWT secrets in production", () => {
    assert.throws(() =>
      assertProductionSecrets(
        productionEnv({ JWT_ACCESS_SECRET: "dev-access-secret-change-me-32" }),
      ),
    );
    assert.throws(() =>
      assertProductionSecrets(productionEnv({ JWT_ACCESS_SECRET: "short-secret-value" })),
    );
    assert.throws(() =>
      assertProductionSecrets(
        productionEnv({
          JWT_ACCESS_SECRET: "same-production-secret-value-32",
          JWT_REFRESH_SECRET: "same-production-secret-value-32",
        }),
      ),
    );
    assert.throws(() => assertProductionSecrets(productionEnv({ WEB_ORIGIN: "*" })));
    assert.throws(() => assertProductionSecrets(productionEnv({ WEB_ORIGIN: "" })));
    assert.doesNotThrow(() => assertProductionSecrets(productionEnv()));
  });
});

describe("auth and admin security", { skip: !dbReady }, () => {
  it("rejects ADMIN self-assignment on register", async () => {
    const res = await api(server.baseUrl, "/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: uniqueEmail("admin-self"),
        password: "StrongPass123",
        displayName: "Nope",
        role: "ADMIN",
      }),
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, "VALIDATION_ERROR");
  });

  it("rejects last-admin deactivation with 409", async () => {
    const actor = await prisma.user.create({
      data: {
        email: uniqueEmail("s10-admin-actor"),
        passwordHash: await hashPassword("StrongPass123"),
        displayName: "S10 Admin Actor",
        role: "ADMIN",
        isActive: false,
      },
    });
    const lastAdmin = await prisma.user.create({
      data: {
        email: uniqueEmail("s10-admin-last"),
        passwordHash: await hashPassword("StrongPass123"),
        displayName: "S10 Last Admin",
        role: "ADMIN",
      },
    });
    createdUserIds.push(actor.id, lastAdmin.id);

    const others = await prisma.user.findMany({
      where: { role: "ADMIN", isActive: true, id: { not: lastAdmin.id } },
      select: { id: true },
    });
    const otherIds = others.map((row) => row.id);
    if (otherIds.length > 0) {
      await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: false } });
    }
    try {
      await assert.rejects(
        () => patchAdminUser({ id: actor.id }, lastAdmin.id, { isActive: false }, {}),
        (error: unknown) => error instanceof HttpError && error.status === 409 && error.code === "LAST_ADMIN",
      );
    } finally {
      if (otherIds.length > 0) {
        await prisma.user.updateMany({ where: { id: { in: otherIds } }, data: { isActive: true } });
      }
    }
  });

  it("rejects a disabled admin token on admin routes", async () => {
    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail("s10-disabled-admin"),
        passwordHash: await hashPassword("StrongPass123"),
        displayName: "S10 Disabled Admin",
        role: "ADMIN",
        isActive: false,
      },
    });
    createdUserIds.push(admin.id);
    const token = signAccessToken({ userId: admin.id, email: admin.email, role: "ADMIN" });
    const denied = await api(server.baseUrl, "/admin/users", { token });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, "ACCOUNT_DISABLED");
  });
});
