import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

type MailSender = (message: OutboundEmail) => Promise<void>;

let lastOutbound: OutboundEmail | null = null;
let testSender: MailSender | null = null;

function appOrigin(): string {
  const configured = env.PASSWORD_RESET_APP_URL.trim();
  if (configured) return configured.replace(/\/$/, "");
  const origin = env.WEB_ORIGIN.split(",")[0]?.trim() ?? "http://localhost:3000";
  return origin.replace(/\/$/, "");
}

export function passwordResetLink(rawToken: string): string {
  return `${appOrigin()}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export function consumeLastOutboundMail(): OutboundEmail | null {
  const message = lastOutbound;
  lastOutbound = null;
  return message;
}

export function setMailSenderForTests(sender: MailSender | null): void {
  testSender = sender;
}

export function buildPasswordResetEmail(
  to: string,
  resetUrl: string,
  ttlMinutes: number,
): OutboundEmail {
  const subject = "Reset your EnerMesh password";
  const text = [
    "EnerMesh password reset",
    "",
    "We received a request to reset the password for your EnerMesh account.",
    "Open the link below to choose a new password. The link expires in",
    `${ttlMinutes} minutes and can be used once.`,
    "",
    resetUrl,
    "",
    "If you did not request this, you can ignore this message. Your password will stay the same.",
    "EnerMesh will never ask you to send your password by email.",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#0f172a;font-family:Arial,Helvetica,sans-serif;color:#e2e8f0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0f172a;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#111827;border:1px solid #1e293b;border-radius:12px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;color:#34d399;text-transform:uppercase;">EnerMesh</p>
                <h1 style="margin:0 0 16px;font-size:22px;color:#f8fafc;">Reset your password</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#cbd5e1;">
                  We received a request to reset the password for your EnerMesh account.
                  Use the button below to choose a new password. This link expires in
                  <strong style="color:#f8fafc;">${ttlMinutes} minutes</strong> and can be used once.
                </p>
                <p style="margin:0 0 24px;">
                  <a href="${resetUrl}" style="display:inline-block;background:#059669;color:#f8fafc;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">
                    Reset password
                  </a>
                </p>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#94a3b8;">
                  If the button does not work, paste this link into your browser:
                  <br />
                  <a href="${resetUrl}" style="color:#34d399;word-break:break-all;">${resetUrl}</a>
                </p>
                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                  If you did not request this, ignore this email. Your password will stay the same.
                  EnerMesh will never ask you to send your password by email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { to, subject, text, html };
}

function createSmtpTransport() {
  return nodemailer.createTransport(env.SMTP_URL);
}

async function sendViaSmtp(message: OutboundEmail): Promise<void> {
  const transporter = createSmtpTransport();
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}

/**
 * Delivers mail through SMTP_URL when set (Mailpit locally, any SMTP provider
 * in production). The raw reset token is never written to logs.
 */
export async function sendMail(message: OutboundEmail): Promise<void> {
  lastOutbound = message;

  if (testSender) {
    await testSender(message);
    return;
  }

  if (env.NODE_ENV === "test") {
    return;
  }

  if (!env.SMTP_URL) {
    if (env.NODE_ENV === "production") {
      throw new Error("SMTP_URL is required to send mail in production");
    }
    process.stderr.write(
      `[dev-mail] to=${message.to} subject=${message.subject} SMTP_URL unset; mail not sent\n`,
    );
    return;
  }

  await sendViaSmtp(message);
  if (env.NODE_ENV !== "production") {
    process.stderr.write(`[dev-mail] delivered to=${message.to} subject=${message.subject}\n`);
  }
}
