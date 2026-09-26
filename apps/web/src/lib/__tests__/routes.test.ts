import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isProtectedPath, loginHref, sanitizeNextPath } from "../routes.js";

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
    assert.equal(isProtectedPath("/marketplace"), false);
  });
});
