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
    const [header] = token.split(".");
    assert.ok(header);
    const alg = JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as { alg?: string };
    assert.equal(alg.alg, "HS256");
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
    assert.equal(res.body.data!.user.role, "SELLER");
    const serialized = JSON.stringify(res.body);
    assert.equal(serialized.includes("passwordHash"), false);
    assert.equal(serialized.includes("$2"), false);
    const refreshCookie = res.setCookie.find((cookie) => cookie.startsWith("enermesh_refresh="));
    assert.ok(refreshCookie);
    assert.match(refreshCookie, /HttpOnly/i);
    assert.match(refreshCookie, /Path=\/api\/v1\/auth/i);
    assert.match(refreshCookie, /SameSite=Lax/i);
    assert.equal(/Secure/i.test(refreshCookie), false);
  });

  it("registers a BUYER and logs in with the same credentials", async () => {
    const { email, password, res } = await registerUser("BUYER");
    assert.equal(res.status, 201);
    assert.equal(res.body.data!.user.role, "BUYER");
    const login = await api<{ user: { role: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.data!.user.role, "BUYER");
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

    const rotated = first.setCookie.find((c) => c.startsWith("enermesh_refresh="))?.split(";")[0];
    if (rotated) {
      const afterReuse = await api(server.baseUrl, "/auth/refresh", {
        method: "POST",
        cookie: rotated,
        body: JSON.stringify({}),
      });
      assert.equal(afterReuse.status, 401);
    }
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

    const buyer = await registerUser("BUYER");
    const buyerLogin = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: buyer.email, password: buyer.password }),
    });
    const buyerDenied = await api(server.baseUrl, "/admin/users", {
      token: buyerLogin.body.data!.tokens.accessToken,
    });
    assert.equal(buyerDenied.status, 403);
    assert.equal(buyerDenied.body.error?.code, "FORBIDDEN");

    const auditDenied = await api(server.baseUrl, "/admin/audit-logs", {
      token: buyerLogin.body.data!.tokens.accessToken,
    });
    assert.equal(auditDenied.status, 403);
    const reportsDenied = await api(server.baseUrl, "/reports/marketplace", {
      token: sellerToken,
    });
    assert.equal(reportsDenied.status, 403);
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

  it("returns the same forgot-password payload for existing and unknown emails", async () => {
    const { consumeLastOutboundMail, setMailSenderForTests } = await import("../lib/mailer.js");
    const deliveries: string[] = [];
    setMailSenderForTests(async (message) => {
      deliveries.push(message.to);
    });
    const { email } = await registerUser("BUYER");
    consumeLastOutboundMail();
    deliveries.length = 0;

    const existing = await api<{ message: string }>(server.baseUrl, "/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    const missing = await api<{ message: string }>(server.baseUrl, "/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: uniqueEmail("ghost-reset") }),
    });
    assert.equal(existing.status, 200);
    assert.equal(missing.status, 200);
    assert.equal(existing.body.data!.message, missing.body.data!.message);
    assert.equal(JSON.stringify(existing.body).includes("token"), false);
    assert.deepEqual(deliveries, [email]);
    const outbound = consumeLastOutboundMail();
    assert.ok(outbound);
    assert.match(outbound.text, /reset-password\?token=/);
    assert.match(outbound.html ?? "", /Reset password/);
    setMailSenderForTests(null);
  });

  it("keeps the generic forgot-password response when mail delivery fails", async () => {
    const { consumeLastOutboundMail, setMailSenderForTests } = await import("../lib/mailer.js");
    setMailSenderForTests(async () => {
      throw new Error("smtp unavailable");
    });
    const { email } = await registerUser("BUYER");
    consumeLastOutboundMail();
    const res = await api<{ message: string }>(server.baseUrl, "/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data!.message, "If an account exists for that email, a reset link has been sent.");
    assert.equal(JSON.stringify(res.body).includes("smtp"), false);
    setMailSenderForTests(null);
  });

  it("resets the password once, rejects reuse/expiry, and revokes sessions", async () => {
    const { consumeLastOutboundMail } = await import("../lib/mailer.js");
    const { sha256Hex } = await import("../lib/crypto.js");
    const { email, password } = await registerUser("SELLER");
    consumeLastOutboundMail();

    const login = await api<{ tokens: { accessToken: string } }>(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    const cookie = login.setCookie.find((c) => c.startsWith("enermesh_refresh="))!.split(";")[0]!;

    const requested = await api(server.baseUrl, "/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    assert.equal(requested.status, 200);
    const mail = consumeLastOutboundMail();
    assert.ok(mail);
    const token = new URL(mail.text.match(/https?:\/\/\S+/)![0]!).searchParams.get("token");
    assert.ok(token);
    assert.equal(JSON.stringify(requested.body).includes(token), false);

    const invalid = await api(server.baseUrl, "/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: "not-a-valid-reset-token", password: "BrandNewPass123" }),
    });
    assert.equal(invalid.status, 401);
    assert.equal(invalid.body.error?.code, "INVALID_RESET_TOKEN");

    const reset = await api<{ message: string }>(server.baseUrl, "/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: "BrandNewPass123" }),
    });
    assert.equal(reset.status, 200);

    const replay = await api(server.baseUrl, "/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password: "AnotherPass123" }),
    });
    assert.equal(replay.status, 401);
    assert.equal(replay.body.error?.code, "INVALID_RESET_TOKEN");

    const staleSession = await api(server.baseUrl, "/auth/refresh", {
      method: "POST",
      cookie,
      body: JSON.stringify({}),
    });
    assert.equal(staleSession.status, 401);

    const oldPassword = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    assert.equal(oldPassword.status, 401);

    const newLogin = await api(server.baseUrl, "/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password: "BrandNewPass123" }),
    });
    assert.equal(newLogin.status, 200);

    const { email: expiredEmail } = await registerUser("BUYER");
    consumeLastOutboundMail();
    await api(server.baseUrl, "/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email: expiredEmail }),
    });
    const expiredMail = consumeLastOutboundMail();
    const expiredToken = new URL(expiredMail!.text.match(/https?:\/\/\S+/)![0]!).searchParams.get("token");
    await prisma.passwordResetToken.updateMany({
      where: { tokenHash: sha256Hex(expiredToken!) },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const expired = await api(server.baseUrl, "/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: expiredToken, password: "BrandNewPass123" }),
    });
    assert.equal(expired.status, 401);
    assert.equal(expired.body.error?.code, "INVALID_RESET_TOKEN");
  });
});
