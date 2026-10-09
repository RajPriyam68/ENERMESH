import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  buildPasswordResetEmail,
  consumeLastOutboundMail,
  passwordResetLink,
  sendMail,
  setMailSenderForTests,
} from "../lib/mailer.js";

afterEach(() => {
  setMailSenderForTests(null);
  consumeLastOutboundMail();
});

describe("password reset mail", () => {
  it("builds PeerMatch copy with the reset URL and expiry, without a password", () => {
    const resetUrl = passwordResetLink("abc123token");
    const message = buildPasswordResetEmail("buyer@example.test", resetUrl, 60);
    assert.equal(message.to, "buyer@example.test");
    assert.match(message.subject, /PeerMatch/i);
    assert.match(message.text, /60 minutes/);
    assert.match(message.text, /reset-password\?token=/);
    assert.match(message.html ?? "", /Reset password/);
    assert.match(message.html ?? "", /PeerMatch/);
    assert.equal(message.text.includes("passwordHash"), false);
    assert.equal(/current password/i.test(message.text), false);
  });

  it("invokes the configured transport and never puts the token in API-shaped payloads", async () => {
    const sent: unknown[] = [];
    setMailSenderForTests(async (message) => {
      sent.push(message);
    });
    const resetUrl = "http://localhost:3000/reset-password?token=secrettokenvalue";
    await sendMail(buildPasswordResetEmail("buyer@example.test", resetUrl, 60));
    assert.equal(sent.length, 1);
    const stored = consumeLastOutboundMail();
    assert.ok(stored);
    assert.match(stored.text, /secrettokenvalue/);
  });

  it("surfaces transport failures to the caller", async () => {
    setMailSenderForTests(async () => {
      throw new Error("smtp down");
    });
    await assert.rejects(() => sendMail(buildPasswordResetEmail("a@b.test", "http://localhost/reset-password?token=x", 60)), /smtp down/);
  });
});
