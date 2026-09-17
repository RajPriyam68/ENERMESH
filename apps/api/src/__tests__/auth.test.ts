import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { api, pingDatabase, prisma, startTestServer, uniqueEmail } from "./helpers.js";

const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, refreshExpiryDate } =
  await import("../lib/jwt.js");
const { hashPassword, verifyPassword } = await import("../lib/password.js");
const { sha256Hex, randomHex, safeEqualHex } = await import("../lib/crypto.js");
const { buildWalletChallenge } = await import("../lib/wallet-message.js");

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

describe("jwt service", () => {
  it("round-trips access tokens with identity claims", () => {
    const token = signAccessToken({ userId: "u1", email: "a@b.test", role: "BUYER" });
    const payload = verifyAccessToken(token);
    assert.equal(payload.sub, "u1");
    assert.equal(payload.email, "a@b.test");
    assert.equal(payload.role, "BUYER");
    assert.equal(payload.type, "access");
  });

  it("rejects an access token presented as a refresh token", () => {
    const token = signAccessToken({ userId: "u1", email: "a@b.test", role: "BUYER" });
    assert.throws(() => verifyRefreshToken(token));
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken({ userId: "u1", email: "a@b.test", role: "BUYER" });
    assert.throws(() => verifyAccessToken(`${token.slice(0, -2)}xx`));
  });

  it("derives refresh expiry from the token exp claim", () => {
    const token = signRefreshToken({ userId: "u1", tokenId: "t1" });
    const expires = refreshExpiryDate(token);
    assert.ok(expires.getTime() > Date.now());
    assert.deepEqual(verifyRefreshToken(token).tokenId, "t1");
  });
});

describe("password service", () => {
  it("hashes and verifies without storing plaintext", async () => {
    const hash = await hashPassword("Sup3rSecretPass");
    assert.notEqual(hash, "Sup3rSecretPass");
    assert.equal(await verifyPassword("Sup3rSecretPass", hash), true);
    assert.equal(await verifyPassword("wrong-password", hash), false);
  });
});

describe("crypto helpers", () => {
  it("produces stable hashes and constant-time comparisons", () => {
    assert.equal(sha256Hex("abc"), sha256Hex("abc"));
    assert.notEqual(sha256Hex("abc"), sha256Hex("abd"));
    assert.equal(safeEqualHex(sha256Hex("abc"), sha256Hex("abc")), true);
    assert.equal(safeEqualHex("aa", "bbbb"), false);
    assert.equal(randomHex(16).length, 32);
  });
});

describe("wallet challenge message", () => {
  it("is deterministic and binds address, chain and nonce", () => {
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const message = buildWalletChallenge({
      address: "0xabc",
      nonce: "n1",
      chainId: 80002,
      issuedAt,
    });
    assert.equal(
      message,
      buildWalletChallenge({ address: "0xabc", nonce: "n1", chainId: 80002, issuedAt }),
    );
    assert.match(message, /Address: 0xabc/);
    assert.match(message, /Chain ID: 80002/);
    assert.match(message, /Nonce: n1/);
    assert.match(message, /2026-01-01T00:00:00.000Z/);
  });
});

describe("auth integration", { skip: !dbReady }, () => {
  const registerUser = async (role: "BUYER" | "SELLER" = "SELLER") => {
    const email = uniqueEmail("auth");
    const password = "StrongPass123";
    const res = await api<{ user: { id: string; role: string }; tokens: { accessToken: string } }>(
      server.baseUrl,
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password, displayName: "Auth Tester", role }),
      },
    );
    if (res.body.data?.user?.id) createdUserIds.push(res.body.data.user.id);
    return { email, password, res };
  };

  it("registers a user, issues tokens and never leaks the password hash", async () => {
    const { res } = await registerUser("SELLER");
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes("passwordHash"), false);
    assert.equal(serialized.includes("$2"), false);
    assert.ok(res.setCookie.some((cookie) => cookie.startsWith("enermesh_refresh=")));
  });

  it("rejects duplicate emails with 409", async () => {
    const { email, password } = await registerUser();
    const res = await api(server.baseUrl, "/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName: "Dup", role: "BUYER" }),
    });
    assert.equal(res.status, 409);
    assert.equal(res.body.error?.code, "EMAIL_IN_USE");
  });

  it("rejects weak passwords with 422", async () => {
    const res = await api(server.baseUrl, "/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: uniqueEmail("weak"),
        password: "weak",
        displayName: "Weak",
        role: "BUYER",
      }),
    });
    assert.equal(res.status, 422);
    assert.equal(res.body.error?.code, "VALIDATION_ERROR");
  });

  it("rejects invalid credentials with 401 and does not reveal account existence", async () => {
    const { email } = await registerUser();
    const wrong = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "WrongPass123" }),
    });
    const missing = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: uniqueEmail("ghost"), password: "WrongPass123" }),
    });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal(wrong.body.error?.message, missing.body.error?.message);
  });

  it("logs in and returns the current user for a valid access token", async () => {
    const { email, password } = await registerUser("BUYER");
    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    const token = login.body.data!.tokens.accessToken;

    const me = await api<{ user: { email: string; role: string } }>(server.baseUrl, "/auth/me", {
      token,
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.data!.user.email, email);
    assert.equal(me.body.data!.user.role, "BUYER");
  });

  it("rejects protected routes without a token", async () => {
    const res = await api(server.baseUrl, "/users/me");
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, "UNAUTHENTICATED");
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const { email, password } = await registerUser();
    const login = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const cookie = login.setCookie.find((c) => c.startsWith("enermesh_refresh="))!.split(";")[0]!;

    const first = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(first.status, 200);

    const replay = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(replay.status, 401);
  });

  it("requires a refresh token when none is supplied", async () => {
    const res = await api(server.baseUrl, "/auth/refresh", { method: "POST", body: JSON.stringify({}) });
    assert.equal(res.status, 401);
    assert.equal(res.body.error?.code, "REFRESH_TOKEN_MISSING");
  });

  it("invalidates the refresh token on logout", async () => {
    const { email, password } = await registerUser();
    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const token = login.body.data!.tokens.accessToken;
    const cookie = login.setCookie.find((c) => c.startsWith("enermesh_refresh="))!.split(";")[0]!;

    const loggedOut = await api(server.baseUrl, "/auth/logout", {
      method: "POST",
      token,
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(loggedOut.status, 200);

    const afterLogout = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(afterLogout.status, 401);
  });

  it("logs out using only the refresh cookie when the access token is missing", async () => {
    const { email, password } = await registerUser();
    const login = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const cookie = login.setCookie.find((c) => c.startsWith("enermesh_refresh="))!.split(";")[0]!;

    const loggedOut = await api(server.baseUrl, "/auth/logout", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(loggedOut.status, 200);
    assert.equal(loggedOut.body.success, true);

    const afterLogout = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(afterLogout.status, 401);
  });

  it("enforces RBAC on admin routes", async () => {
    const { email, password } = await registerUser("SELLER");
    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const sellerToken = login.body.data!.tokens.accessToken;

    const denied = await api(server.baseUrl, "/admin/users", { token: sellerToken });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error?.code, "FORBIDDEN");

    const anonymous = await api(server.baseUrl, "/admin/users");
    assert.equal(anonymous.status, 401);

    const admin = await prisma.user.create({
      data: {
        email: uniqueEmail("admin"),
        passwordHash: await hashPassword("StrongPass123"),
        displayName: "Admin",
        role: "ADMIN",
      },
    });
    createdUserIds.push(admin.id);
    const adminToken = signAccessToken({ userId: admin.id, email: admin.email, role: "ADMIN" });
    const allowed = await api<{ users: unknown[] }>(server.baseUrl, "/admin/users", {
      token: adminToken,
    });
    assert.equal(allowed.status, 200);
    assert.ok(Array.isArray(allowed.body.data!.users));
  });

  it("updates profile and settings and rejects unknown fields", async () => {
    const { email, password } = await registerUser("BUYER");
    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const token = login.body.data!.tokens.accessToken;

    const updated = await api<{ user: { displayName: string; phone: string | null } }>(
      server.baseUrl,
      "/users/me",
      { method: "PATCH", token, body: JSON.stringify({ displayName: "New Name", phone: "+1 555 0100" }) },
    );
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data!.user.displayName, "New Name");
    assert.equal(updated.body.data!.user.phone, "+1 555 0100");

    const settings = await api<{ user: { energyTypesOfInterest: string[] } }>(
      server.baseUrl,
      "/users/me/settings",
      {
        method: "PATCH",
        token,
        body: JSON.stringify({ energyTypesOfInterest: ["SOLAR", "WIND"], notificationEmail: false }),
      },
    );
    assert.equal(settings.status, 200);
    assert.deepEqual(settings.body.data!.user.energyTypesOfInterest.sort(), ["SOLAR", "WIND"]);

    const unknownField = await api(server.baseUrl, "/users/me", {
      method: "PATCH",
      token,
      body: JSON.stringify({ displayName: "X", isAdmin: true }),
    });
    assert.equal(unknownField.status, 422);
  });

  it("changes password, revokes sessions and rejects a wrong current password", async () => {
    const { email, password } = await registerUser("BUYER");
    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const token = login.body.data!.tokens.accessToken;
    const cookie = login.setCookie.find((c) => c.startsWith("enermesh_refresh="))!.split(";")[0]!;

    const wrong = await api(server.baseUrl, "/users/me/password", {
      method: "POST",
      token,
      body: JSON.stringify({ currentPassword: "NopePass123", newPassword: "BrandNewPass123" }),
    });
    assert.equal(wrong.status, 401);

    const changed = await api(server.baseUrl, "/users/me/password", {
      method: "POST",
      token,
      body: JSON.stringify({ currentPassword: password, newPassword: "BrandNewPass123" }),
    });
    assert.equal(changed.status, 200);

    const staleSession = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(staleSession.status, 401);

    const newLogin = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "BrandNewPass123" }),
    });
    assert.equal(newLogin.status, 200);
  });
});
