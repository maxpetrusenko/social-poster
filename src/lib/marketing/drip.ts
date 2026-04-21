import crypto from "node:crypto";
import { and, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { dripQueue, platforms, posts } from "@/db/schema";
import { sendNotificationEmail } from "@/lib/notifications/send";
import { getAppUrlFromEnv } from "@/lib/app-url";

const DRIP_EMAILS = [
  { key: "welcome_1", delayMs: 0 },
  { key: "welcome_2_connect", delayMs: 2 * 24 * 60 * 60 * 1000 },
  { key: "welcome_3_first_post", delayMs: 5 * 24 * 60 * 60 * 1000 },
] as const;

type DripKey = (typeof DRIP_EMAILS)[number]["key"];

const dripContent: Record<DripKey, { subject: string; body: string; cta: string; href: string }> = {
  welcome_1: {
    subject: "Welcome to ClawPoster",
    body: "You're in! ClawPoster helps you schedule and publish across every social platform from one dashboard. Here's a quick path to your first post:",
    cta: "Open Dashboard",
    href: "/dashboard",
  },
  welcome_2_connect: {
    subject: "Connect your first social account",
    body: "You're one step away from publishing. Connect a social account (X, LinkedIn, Instagram, or any platform) to start scheduling posts.",
    cta: "Connect Account",
    href: "/dashboard/workspace-settings/social-accounts",
  },
  welcome_3_first_post: {
    subject: "Ready to publish your first post?",
    body: "Your accounts are set up — now create your first post. It takes 30 seconds. Write it, pick your platforms, and hit publish.",
    cta: "Create Post",
    href: "/dashboard/posts/create",
  },
};

function renderDripHtml(key: DripKey) {
  const { subject, body, cta, href } = dripContent[key];
  const base = getAppUrlFromEnv();
  const url = `${base}${href}`;
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 520px; margin: 0 auto; padding: 40px 20px;">
      <h2 style="margin: 0 0 16px; color: #171717;">${subject}</h2>
      <p style="color: #5f523f; line-height: 1.6; margin: 0 0 24px;">${body}</p>
      <a href="${url}" style="display: inline-block; background: #171717; color: #fffaf2; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">${cta}</a>
      <p style="color: #9b8c78; font-size: 12px; line-height: 1.5; margin: 28px 0 0;">You're getting this because you signed up for ClawPoster.</p>
    </div>
  `;
}

export function enqueueDrip(userId: string, workspaceId: string) {
  const now = new Date();
  for (const { key, delayMs } of DRIP_EMAILS) {
    db.insert(dripQueue)
      .values({
        id: crypto.randomUUID(),
        userId,
        workspaceId,
        emailKey: key,
        scheduledAt: new Date(now.getTime() + delayMs),
        createdAt: now,
      })
      .onConflictDoNothing()
      .run();
  }
}

export function cancelDripIfDone(userId: string, emailKey: string) {
  db.update(dripQueue)
    .set({ cancelledAt: new Date() })
    .where(
      and(
        eq(dripQueue.userId, userId),
        eq(dripQueue.emailKey, emailKey),
        isNull(dripQueue.sentAt),
        isNull(dripQueue.cancelledAt),
      ),
    )
    .run();
}

async function shouldCancel(userId: string, workspaceId: string, key: string): Promise<boolean> {
  if (key === "welcome_2_connect") {
    const [p] = await db
      .select({ id: platforms.id })
      .from(platforms)
      .where(eq(platforms.workspaceId, workspaceId))
      .limit(1);
    return p != null;
  }
  if (key === "welcome_3_first_post") {
    const [p] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.workspaceId, workspaceId), eq(posts.status, "published")))
      .limit(1);
    return p != null;
  }
  return false;
}

export async function processDripQueue() {
  const now = new Date();
  const due = db
    .select()
    .from(dripQueue)
    .where(
      and(
        lte(dripQueue.scheduledAt, now),
        isNull(dripQueue.sentAt),
        isNull(dripQueue.cancelledAt),
      ),
    )
    .all();

  let sent = 0;
  let cancelled = 0;

  for (const item of due) {
    if (await shouldCancel(item.userId, item.workspaceId, item.emailKey)) {
      cancelDripIfDone(item.userId, item.emailKey);
      cancelled++;
      continue;
    }

    const key = item.emailKey as DripKey;
    if (!dripContent[key]) continue;

    const result = await sendNotificationEmail({
      userId: item.userId,
      workspaceId: item.workspaceId,
      type: "marketing",
      data: {
        subject: dripContent[key].subject,
        message: dripContent[key].body,
        html: renderDripHtml(key),
        href: dripContent[key].href,
      },
      dedupeKey: `drip:${item.emailKey}:${item.userId}`,
    });

    const alreadyDelivered =
      "skipped" in result &&
      result.skipped === "duplicate" &&
      ["sent_to_provider", "delivered"].includes(result.deliveryStatus);
    const terminalDuplicate =
      "skipped" in result &&
      result.skipped === "duplicate" &&
      ["failed_terminal", "bounced", "complained", "suppressed"].includes(result.deliveryStatus);

    if ("sent" in result || alreadyDelivered) {
      db.update(dripQueue)
        .set({ sentAt: now })
        .where(eq(dripQueue.id, item.id))
        .run();
      sent++;
      continue;
    }

    if (terminalDuplicate || ("skipped" in result && result.skipped !== "duplicate")) {
      db.update(dripQueue)
        .set({ cancelledAt: now })
        .where(eq(dripQueue.id, item.id))
        .run();
      cancelled++;
      continue;
    }

    console.warn(`[drip] send did not complete for ${item.emailKey}; leaving queued for retry`);
  }

  if (sent || cancelled) {
    console.log(`[drip] processed: ${sent} sent, ${cancelled} cancelled`);
  }
}
