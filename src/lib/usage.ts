import { db } from "@/db";
import { organizations, usageEvents, workspaces } from "@/db/schema";
import { sendWorkspaceNotificationEmail } from "@/lib/notifications/send";
import { randomUUID } from "crypto";
import { and, count, eq, gte } from "drizzle-orm";

export type UsageEventType =
  | "post_published"
  | "reply_sent"
  | "comment_sent"
  | "dm_sent"
  | "upload"
  | "api_call"
  | "schedule_run";

export async function trackUsage(
  workspaceId: string,
  eventType: UsageEventType,
  platformId?: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(usageEvents).values({
    id: randomUUID(),
    workspaceId,
    platformId: platformId || null,
    eventType,
    metadata: metadata ? JSON.stringify(metadata) : null,
    createdAt: new Date(),
  });

  if (eventType === "post_published") {
    await checkPostUsageLimits(workspaceId);
  }
}

async function checkPostUsageLimits(workspaceId: string) {
  const [row] = await db
    .select({
      planLabel: organizations.planLabel,
      maxPostsPerMonth: organizations.maxPostsPerMonth,
      billingCycleStart: organizations.billingCycleStart,
    })
    .from(workspaces)
    .innerJoin(organizations, eq(organizations.id, workspaces.organizationId))
    .where(eq(workspaces.id, workspaceId));

  if (!row?.maxPostsPerMonth || row.maxPostsPerMonth <= 0) return;

  const cycleStart =
    row.billingCycleStart ||
    new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [{ count: used }] = await db
    .select({ count: count() })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.workspaceId, workspaceId),
        eq(usageEvents.eventType, "post_published"),
        gte(usageEvents.createdAt, cycleStart)
      )
    );

  const threshold = used >= row.maxPostsPerMonth ? 100 : used / row.maxPostsPerMonth >= 0.8 ? 80 : null;
  if (!threshold) return;

  await sendWorkspaceNotificationEmail({
    workspaceId,
    type: "usage_alert",
    data: {
      current: used,
      limit: row.maxPostsPerMonth,
      threshold,
      href: "/dashboard/settings/usage",
      message: `You've used ${used}/${row.maxPostsPerMonth} posts on the ${row.planLabel} plan.`,
    },
    dedupeKey: `usage:${workspaceId}:${cycleStart.getTime()}:${threshold}`,
  });
}
