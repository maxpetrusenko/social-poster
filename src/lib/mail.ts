import nodemailer from "nodemailer";
import { getAppUrlFromEnv, normalizeAppUrl } from "@/lib/app-url";
import { INVITE_TTL_DAYS } from "@/lib/invite-config";

function getEmailBaseUrl(baseUrl?: string) {
  return (
    normalizeAppUrl(process.env.APP_URL) ??
    normalizeAppUrl(baseUrl) ??
    getAppUrlFromEnv()
  );
}

export function getMagicLinkUrl(token: string, baseUrl?: string) {
  const base = getEmailBaseUrl(baseUrl);
  return `${base}/api/auth/verify?token=${token}`;
}

export function getInvitationUrl(token: string, baseUrl?: string) {
  const base = getEmailBaseUrl(baseUrl);
  return `${base}/invite/${token}`;
}

export function hasSmtpConfig() {
  return Boolean(getSmtpUser() && getSmtpPass());
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function hasEmailDeliveryConfig() {
  return hasResendConfig() || hasSmtpConfig();
}

function getSmtpUser() {
  return process.env.SMTP_USER?.trim() || process.env.EMAIL_HOST_USER?.trim();
}

function getSmtpPass() {
  return process.env.SMTP_PASS?.trim() || process.env.EMAIL_HOST_PASSWORD?.trim();
}

function getConfiguredEmailAddress(value?: string | null) {
  const email = value?.trim();
  if (!email) return null;
  const lower = email.toLowerCase();
  if (
    lower.endsWith("@yourdomain.com") ||
    lower.endsWith("@example.com") ||
    lower === "noreply@yourdomain.com"
  ) {
    return null;
  }
  return email;
}

function getSmtpFromAddress() {
  return (
    getConfiguredEmailAddress(process.env.SMTP_FROM) ||
    getConfiguredEmailAddress(process.env.MAIL_FROM) ||
    getConfiguredEmailAddress(process.env.DEFAULT_FROM_EMAIL) ||
    getSmtpUser()
  );
}

function getMailFromAddress(stream?: "transactional" | "marketing") {
  if (stream === "marketing" && process.env.RESEND_MARKETING_FROM_EMAIL?.trim()) {
    return process.env.RESEND_MARKETING_FROM_EMAIL.trim();
  }

  return (
    getConfiguredEmailAddress(process.env.RESEND_FROM_EMAIL) ||
    getConfiguredEmailAddress(process.env.MAIL_FROM) ||
    getConfiguredEmailAddress(process.env.SMTP_FROM) ||
    getConfiguredEmailAddress(process.env.DEFAULT_FROM_EMAIL) ||
    getSmtpUser() ||
    "onboarding@resend.dev"
  );
}

function createSmtpTransporter() {
  const port = Number(process.env.SMTP_PORT ?? process.env.EMAIL_PORT ?? 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || process.env.EMAIL_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: {
      user: getSmtpUser(),
      pass: getSmtpPass(),
    },
  });
}

export type EmailDeliveryResult = {
  provider: "log" | "preview" | "resend" | "smtp";
  externalMessageId: string | null;
};

async function sendViaResend(input: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  stream?: "transactional" | "marketing";
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Resend is not configured.");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (input.idempotencyKey) {
    headers["Idempotency-Key"] = input.idempotencyKey;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify({
      from: getMailFromAddress(input.stream),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      headers: input.headers,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error: ${response.status} ${body}`.trim());
  }

  const payload = await response.json().catch(() => null) as { id?: string } | null;
  return payload?.id ?? null;
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  stream?: "transactional" | "marketing";
}): Promise<EmailDeliveryResult> {
  const mode = process.env.EMAIL_DELIVERY_MODE?.trim() || "resend";
  const to = process.env.EMAIL_TEST_TO?.trim() || input.to;

  if (mode === "log") {
    console.info(`[email:log] ${input.subject} -> ${to}`);
    return { provider: "log", externalMessageId: null };
  }

  if (hasResendConfig()) {
    const externalMessageId = await sendViaResend({ ...input, to });
    return { provider: "resend", externalMessageId };
  }

  if (!hasSmtpConfig()) {
    console.info(`[email:preview] ${input.subject} -> ${to}`);
    return { provider: "preview", externalMessageId: null };
  }

  const info = await createSmtpTransporter().sendMail({
    from: getSmtpFromAddress(),
    to,
    subject: input.subject,
    html: input.html,
    headers: input.headers,
  });

  return { provider: "smtp", externalMessageId: info.messageId ?? null };
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  baseUrl?: string
) {
  const url = getMagicLinkUrl(token, baseUrl);
  const magicLinkHtml = `
      <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Sign in to SMM Agent</h2>
        <p style="color: #666; margin: 0 0 24px;">Click the button below to sign in. This link expires in 15 minutes.</p>
        <a href="${url}" style="display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Sign In
        </a>
        <p style="color: #999; font-size: 13px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

  if (!hasEmailDeliveryConfig()) {
    console.info(`Magic link for ${email}: ${url}`);
  }

  return sendEmail({
    to: email,
    subject: "Sign in to SMM Agent",
    html: magicLinkHtml,
    stream: "transactional",
  });
}

export async function sendWorkspaceInvitationEmail(input: {
  email: string;
  token: string;
  organizationName: string;
  inviterName: string;
  baseUrl?: string;
}) {
  const email = buildWorkspaceInvitationEmail(input);

  if (!hasEmailDeliveryConfig()) {
    console.info(`Workspace invite for ${input.email}: ${email.url}`);
  }

  return sendEmail({
    to: input.email,
    subject: email.subject,
    html: email.html,
    stream: "transactional",
  });
}

export function buildWorkspaceInvitationEmail(input: {
  token: string;
  baseUrl?: string;
}) {
  const url = getInvitationUrl(input.token, input.baseUrl);
  const subject = "Your SMM Agent access is ready";
  const html = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Start using SMM Agent</h2>
        <p style="color: #666; margin: 0 0 24px;">
          Use this link to sign in and access your SMM Agent workspace.
          This link expires in ${INVITE_TTL_DAYS} days.
        </p>
        <a href="${url}" style="display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Open SMM Agent
        </a>
        <p style="color: #999; font-size: 13px; margin: 24px 0 0;">
          If you were not expecting this, you can ignore the message.
        </p>
      </div>
    `;

  return { subject, html, url };
}
