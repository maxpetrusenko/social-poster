import nodemailer from "nodemailer";
import { INVITE_TTL_DAYS } from "@/lib/tenancy";

export function getMagicLinkUrl(token: string, baseUrl?: string) {
  const base = process.env.APP_URL ?? baseUrl ?? "http://localhost:3000";
  return `${base}/api/auth/verify?token=${token}`;
}

export function getInvitationUrl(token: string, baseUrl?: string) {
  const base = process.env.APP_URL ?? baseUrl ?? "http://localhost:3000";
  return `${base}/invite/${token}`;
}

export function hasSmtpConfig() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

function getMailFromAddress() {
  return (
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.MAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim() ||
    "onboarding@resend.dev"
  );
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendViaResend(input: {
  to: string;
  subject: string;
  html: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Resend is not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getMailFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Resend error: ${response.status} ${body}`.trim());
  }
}

export async function sendMagicLinkEmail(
  email: string,
  token: string,
  baseUrl?: string
) {
  const url = getMagicLinkUrl(token, baseUrl);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const magicLinkHtml = `
      <div style="font-family: system-ui, sans-serif; max-width: 400px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Sign in to Social Agent</h2>
        <p style="color: #666; margin: 0 0 24px;">Click the button below to sign in. This link expires in 15 minutes.</p>
        <a href="${url}" style="display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Sign In
        </a>
        <p style="color: #999; font-size: 13px; margin: 24px 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;

  if (hasResendConfig()) {
    await sendViaResend({
      to: email,
      subject: "Sign in to Social Agent",
      html: magicLinkHtml,
    });
    return;
  }

  if (!smtpUser || !smtpPass) {
    console.info(`Magic link for ${email}: ${url}`);
    return;
  }

  await transporter.sendMail({
    from: smtpUser,
    to: email,
    subject: "Sign in to Social Agent",
    html: magicLinkHtml,
  });
}

export async function sendWorkspaceInvitationEmail(input: {
  email: string;
  token: string;
  organizationName: string;
  inviterName: string;
  baseUrl?: string;
}) {
  const url = getInvitationUrl(input.token, input.baseUrl);
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const inviteHtml = `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h2 style="margin: 0 0 16px;">Join ${input.organizationName}</h2>
        <p style="color: #666; margin: 0 0 24px;">
          ${input.inviterName} invited you to collaborate in Social Agent.
          This invite stays active for ${INVITE_TTL_DAYS} days.
        </p>
        <a href="${url}" style="display: inline-block; background: #0f172a; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
          Review Invite
        </a>
        <p style="color: #999; font-size: 13px; margin: 24px 0 0;">
          If you were not expecting this, you can ignore the message.
        </p>
      </div>
    `;

  if (hasResendConfig()) {
    await sendViaResend({
      to: input.email,
      subject: `You're invited to ${input.organizationName}`,
      html: inviteHtml,
    });
    return;
  }

  if (!smtpUser || !smtpPass) {
    console.info(`Workspace invite for ${input.email}: ${url}`);
    return;
  }

  await transporter.sendMail({
    from: smtpUser,
    to: input.email,
    subject: `You're invited to ${input.organizationName}`,
    html: inviteHtml,
  });
}
