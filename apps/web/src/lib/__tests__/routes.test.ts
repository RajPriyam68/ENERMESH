import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProtectedPath, loginHref, sanitizeNextPath } from "../routes.js";
import { resolveSocketUrl } from "../socket-url.js";

describe("sanitizeNextPath", () => {
  it("allows same-site absolute paths", () => {
    assert.equal(sanitizeNextPath("/marketplace"), "/marketplace");
    assert.equal(sanitizeNextPath("/settings?tab=wallet"), "/settings?tab=wallet");
  });

  it("falls back to the marketplace for empty input", () => {
    assert.equal(sanitizeNextPath(null), "/marketplace");
    assert.equal(sanitizeNextPath(undefined), "/marketplace");
    assert.equal(sanitizeNextPath(""), "/marketplace");
  });

  it("blocks external and protocol-relative redirects", () => {
    assert.equal(sanitizeNextPath("https://evil.example/steal"), "/marketplace");
    assert.equal(sanitizeNextPath("//evil.example"), "/marketplace");
    assert.equal(sanitizeNextPath("/\\evil.example"), "/marketplace");
    assert.equal(sanitizeNextPath("/ok\\..\\.."), "/marketplace");
    assert.equal(sanitizeNextPath("/line\nbreak"), "/marketplace");
    assert.equal(sanitizeNextPath("https://evil.example/?next=/admin"), "/marketplace");
  });
});

describe("loginHref", () => {
  it("encodes the next path", () => {
    assert.equal(loginHref(), "/login");
    assert.equal(loginHref("/profile"), "/login?next=%2Fprofile");
  });
});

describe("isProtectedPath", () => {
  it("covers profile, settings and seller offer routes", () => {
    assert.equal(isProtectedPath("/profile"), true);
    assert.equal(isProtectedPath("/settings"), true);
    assert.equal(isProtectedPath("/offers"), true);
    assert.equal(isProtectedPath("/offers/new"), true);
    assert.equal(isProtectedPath("/bids"), true);
    assert.equal(isProtectedPath("/matches"), true);
    assert.equal(isProtectedPath("/notifications"), true);
    assert.equal(isProtectedPath("/dashboard"), true);
    assert.equal(isProtectedPath("/advisor"), true);
    assert.equal(isProtectedPath("/telemetry"), true);
    assert.equal(isProtectedPath("/admin"), true);
    assert.equal(isProtectedPath("/admin/audit"), true);
    assert.equal(isProtectedPath("/admin/reports"), true);
    assert.equal(isProtectedPath("/marketplace"), false);
    assert.equal(isProtectedPath("/login"), false);
    assert.equal(isProtectedPath("/register"), false);
    assert.equal(isProtectedPath("/forgot-password"), false);
    assert.equal(isProtectedPath("/reset-password"), false);
  });
});

describe("resolveSocketUrl", () => {
  it("keeps same-origin rewrites when the public socket URL is empty or relative", () => {
    assert.equal(resolveSocketUrl(undefined), undefined);
    assert.equal(resolveSocketUrl(""), undefined);
    assert.equal(resolveSocketUrl("   "), undefined);
    assert.equal(resolveSocketUrl("/socket.io"), undefined);
  });

  it("accepts absolute http(s) origins and rejects other schemes", () => {
    assert.equal(resolveSocketUrl("https://api.example/socket.io"), "https://api.example");
    assert.equal(resolveSocketUrl("http://localhost:3001"), "http://localhost:3001");
    assert.equal(resolveSocketUrl("javascript:alert(1)"), undefined);
    assert.equal(resolveSocketUrl("not a url"), undefined);
  });
});
