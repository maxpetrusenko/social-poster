import "server-only";

import crypto from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  emailSuppressions,
  notificationDeliveries,
  notificationPreferences,
  notifications,
  users,
  workspaceMemberships,
} from "@/db/schema";
import { sendEmail } from "@/lib/mail";
import { getAppUrlFromEnv } from "@/lib/app-url";
import { createUnsubscribeToken } from "@/lib/marketing/unsubscribe";

export type NotificationEmailType =
  | "post_failure"
  | "account_disconnect"
  | "payment_alert"
  | "usage_alert"
  | "marketing";

type NotificationData = {
  subject?: string | null;
  html?: string | null;
  title?: string | null;
  platform?: string | null;
  handle?: string | null;
  message?: string | null;
  current?: number;
  limit?: number;
  threshold?: number;
  href?: string;
};

const preferenceByType = {
  post_failure: "postFailures",
  account_disconnect: "accountDisconnects",
  payment_alert: "paymentAlerts",
  usage_alert: "usageAlerts",
  marketing: "marketingEmails",
} as const;

const subjectByType = {
  post_failure: "Post failed to publish",
  account_disconnect: "Social account disconnected",
  payment_alert: "Billing alert",
  usage_alert: "Usage limit alert",
  marketing: "ClawPoster update",
} as const;

function subjectFor(type: NotificationEmailType, data: NotificationData) {
  if (type === "marketing" && data.subject?.trim()) return data.subject.trim();
  return subjectByType[type];
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appHref(path: string) {
  const base = getAppUrlFromEnv();
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function renderBody(type: NotificationEmailType, data: NotificationData) {
  if (type === "post_failure") {
    return `Your post "${data.title ?? "Untitled post"}" failed to publish to ${data.platform ?? "a platform"}. ${data.message ?? ""}`.trim();
  }
  if (type === "account_disconnect") {
    return `Your ${data.platform ?? "social"} account${data.handle ? ` (${data.handle})` : ""} has been disconnected. Reconnect it to resume posting.`;
  }
  if (type === "usage_alert") {
    return `You've used ${data.current ?? 0}/${data.limit ?? 0} posts this month.`;
  }
  if (type === "payment_alert") {
    return data.message ?? "There is a billing issue that needs attention.";
  }
  return data.message ?? "A new ClawPoster update is ready.";
}

function renderEmailHtml(type: NotificationEmailType, data: NotificationData) {
  if (type === "marketing" && data.html) {
    return data.html;
  }

  const title = escapeHtml(subjectFor(type, data));
  const body = escapeHtml(renderBody(type, data));
  const href = data.href ?? "/dashboard";
  const cta = type === "account_disconnect" ? "Reconnect" : type === "usage_alert" ? "View usage" : "Open ClawPoster";

  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="margin: 0 0 16px; color: #171717;">${title}</h2>
      <p style="color: #5f523f; line-height: 1.6; margin: 0 0 24px;">${body}</p>
      <a href="${escapeHtml(appHref(href))}" style="display: inline-block; background: #171717; color: #fffaf2; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">${cta}</a>
      <p style="color: #9b8c78; font-size: 12px; line-height: 1.5; margin: 28px 0 0;">Manage notification preferences in ClawPoster settings.</p>
    </div>
  `;
}

async function getPreference(userId: string, workspaceId: string, type: NotificationEmailType) {
  const [prefs] = await db
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.workspaceId, workspaceId)));
  if (!prefs) return true;
  return Boolean(prefs[preferenceByType[type]]);
}

async function isSuppressed(email: string, type: NotificationEmailType) {
  const scope = type === "marketing" ? "marketing" : "transactional_noncritical";
  const [suppression] = await db
    .select()
    .from(emailSuppressions)
    .where(
      and(
        eq(emailSuppressions.email, email.trim().toLowerCase()),
        or(eq(emailSuppressions.scope, "all"), eq(emailSuppressions.scope, scope))
      )
    );
  return Boolean(suppression);
}

async function ensureActivity(input: {
  workspaceId: string;
  type: NotificationEmailType;
  data: NotificationData;
  dedupeKey: string;
}) {
  const existing = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.workspaceId, input.workspaceId), eq(activityLog.dedupeKey, input.dedupeKey)));
  if (existing[0]) return existing[0];

  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actorUserId: null,
    eventType: input.type.replaceAll("_", "."),
    severity: input.type === "marketing" ? "info" : "warning",
    entityType: null,
    entityId: null,
    subject: subjectFor(input.type, input.data),
    body: renderBody(input.type, input.data),
    metadata: input.data as Record<string, unknown>,
    correlationId: null,
    dedupeKey: input.dedupeKey,
    source: "notifications",
    createdAt: now,
  };
  await db.insert(activityLog).values(row).onConflictDoNothing();
  return row;
}

export async function sendNotificationEmail(input: {
  userId: string;
  workspaceId: string;
  type: NotificationEmailType;
  data: NotificationData;
  dedupeKey: string;
}) {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!user?.email) return { skipped: "no_recipient" as const };
  if (!(await getPreference(input.userId, input.workspaceId, input.type))) {
    return { skipped: "preference_disabled" as const };
  }
  if (await isSuppressed(user.email, input.type)) {
    return { skipped: "suppressed" as const };
  }

  const activity = await ensureActivity(input);
  const now = new Date();
  const idempotencyKey = `${input.type}:${input.workspaceId}:${input.userId}:${input.dedupeKey}:v1`;
  const [existingDelivery] = await db
    .select()
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.idempotencyKey, idempotencyKey));
  const isRetry =
    existingDelivery?.status === "failed_retryable" ||
    isStalePendingDelivery(existingDelivery);
  if (existingDelivery && !isRetry) {
    return { skipped: "duplicate" as const, deliveryStatus: existingDelivery.status };
  }

  const notificationId = existingDelivery?.notificationId ?? crypto.randomUUID();
  const deliveryId = existingDelivery?.id ?? crypto.randomUUID();
  const attemptCount = (existingDelivery?.attemptCount ?? 0) + 1;

  if (isRetry) {
    await db
      .update(notificationDeliveries)
      .set({
        status: "pending",
        provider: "resend",
        metadata: input.data as Record<string, unknown>,
        errorClassification: null,
        errorMessage: null,
        failedAt: null,
        nextRetryAt: null,
        updatedAt: now,
      })
      .where(eq(notificationDeliveries.id, deliveryId));
  } else {
    await db
      .insert(notifications)
      .values({
        id: notificationId,
        workspaceId: input.workspaceId,
        activityLogId: activity.id,
        recipientUserId: input.userId,
        channel: "email",
        title: subjectFor(input.type, input.data),
        body: renderBody(input.type, input.data),
        severity: input.type === "marketing" ? "info" : "warning",
        status: "unread",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    await db
      .insert(notificationDeliveries)
      .values({
        id: deliveryId,
        notificationId,
        channel: "email",
        provider: "resend",
        status: "pending",
        attemptCount: 0,
        idempotencyKey,
        metadata: input.data as Record<string, unknown>,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
  }

  const headers: Record<string, string> = {};
  if (input.type === "marketing") {
    const token = createUnsubscribeToken({ email: user.email, scope: "marketing" });
    headers["List-Unsubscribe"] = `<${appHref(`/unsubscribe/${token}`)}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const result = await sendEmail({
      to: user.email,
      subject: subjectFor(input.type, input.data),
      html: renderEmailHtml(input.type, input.data),
      headers,
      idempotencyKey,
      stream: input.type === "marketing" ? "marketing" : "transactional",
    });
    await db
      .update(notificationDeliveries)
      .set({
        provider: result.provider,
        status: "sent_to_provider",
        attemptCount,
        externalMessageId: result.externalMessageId,
        errorClassification: null,
        errorMessage: null,
        sentAt: new Date(),
        failedAt: null,
        nextRetryAt: null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return { sent: true as const };
  } catch (error) {
    await db
      .update(notificationDeliveries)
      .set({
        status: "failed_retryable",
        attemptCount,
        errorClassification: "provider_error",
        errorMessage: error instanceof Error ? error.message : String(error),
        failedAt: new Date(),
        nextRetryAt: new Date(Date.now() + 15 * 60 * 1000),
        updatedAt: new Date(),
      })
      .where(eq(notificationDeliveries.id, deliveryId));
    return { error };
  }
}

function isStalePendingDelivery(
  delivery: typeof notificationDeliveries.$inferSelect | undefined
) {
  if (!delivery || delivery.status !== "pending") return false;
  const updatedAt = delivery.updatedAt instanceof Date
    ? delivery.updatedAt.getTime()
    : new Date(delivery.updatedAt).getTime();
  return Number.isFinite(updatedAt) && Date.now() - updatedAt > 15 * 60 * 1000;
}

export async function sendWorkspaceNotificationEmail(input: {
  workspaceId: string;
  type: NotificationEmailType;
  data: NotificationData;
  dedupeKey: string;
}) {
  const recipients = await db
    .select({ userId: users.id })
    .from(workspaceMemberships)
    .innerJoin(users, eq(workspaceMemberships.userId, users.id))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, input.workspaceId),
        inArray(workspaceMemberships.workspaceRole, ["owner", "manager"])
      )
    );

  const results = [];
  for (const recipient of recipients) {
    results.push(await sendNotificationEmail({ ...input, userId: recipient.userId }));
  }
  return results;
}
