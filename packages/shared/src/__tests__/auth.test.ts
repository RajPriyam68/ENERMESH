import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordFormSchema,
  resetPasswordSchema,
} from "../schemas/auth.js";

describe("auth schemas", () => {
  it("accepts BUYER and SELLER registration and rejects ADMIN", () => {
    const base = {
      email: "user@example.test",
      password: "StrongPass123",
      displayName: "User",
    };
    assert.equal(registerSchema.parse({ ...base, role: "BUYER" }).role, "BUYER");
    assert.equal(registerSchema.parse({ ...base, role: "SELLER" }).role, "SELLER");
    assert.throws(() => registerSchema.parse({ ...base, role: "ADMIN" }));
  });

  it("requires an email for forgot-password and rejects extra fields", () => {
    assert.equal(forgotPasswordSchema.parse({ email: "user@example.test" }).email, "user@example.test");
    assert.throws(() => forgotPasswordSchema.parse({ email: "not-an-email" }));
    assert.throws(() => forgotPasswordSchema.parse({ email: "user@example.test", token: "x" }));
  });

  it("validates reset tokens and matching passwords", () => {
    assert.throws(() => resetPasswordSchema.parse({ token: "short", password: "StrongPass123" }));
    assert.throws(() => resetPasswordSchema.parse({ token: "a".repeat(32), password: "weak" }));
    const parsed = resetPasswordSchema.parse({ token: "a".repeat(32), password: "StrongPass123" });
    assert.equal(parsed.password, "StrongPass123");
    assert.throws(() =>
      resetPasswordFormSchema.parse({ password: "StrongPass123", confirmPassword: "Mismatch123" }),
    );
    assert.equal(
      resetPasswordFormSchema.parse({ password: "StrongPass123", confirmPassword: "StrongPass123" }).password,
      "StrongPass123",
    );
  });
});
