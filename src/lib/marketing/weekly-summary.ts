import "server-only";

import { and, count, eq, gte, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { posts, replyEvents, workspaces, workspaceMemberships } from "@/db/schema";
import { getAppUrlFromEnv } from "@/lib/app-url";

type WeeklySummary = { userId: string; workspaceId: string; html: string; subject: string };

export async function generateWeeklySummaries(): Promise<WeeklySummary[]> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  // Workspaces with posts in the last 7 days
  const activeWorkspaces = await db
    .selectDistinct({ id: posts.workspaceId })
    .from(posts)
    .where(and(gte(posts.createdAt, weekAgo), isNotNull(posts.workspaceId)))
    .then((rows) => rows.map((r) => r.id!).filter(Boolean));

  if (!activeWorkspaces.length) return [];

  const summaries: WeeklySummary[] = [];

  for (const wsId of activeWorkspaces) {
    // Post counts by status
    const statusCounts = await db
      .select({ status: posts.status, total: count() })
      .from(posts)
      .where(and(eq(posts.workspaceId, wsId), gte(posts.createdAt, weekAgo)))
      .groupBy(posts.status);

    const byStat = Object.fromEntries(statusCounts.map((r) => [r.status, r.total]));

    // Reply events sent
    const [replyRow] = await db
      .select({ total: count() })
      .from(replyEvents)
      .where(and(eq(replyEvents.workspaceId, wsId), eq(replyEvents.status, "sent"), gte(replyEvents.createdAt, weekAgo)));

    // Upcoming scheduled posts
    const [upcomingRow] = await db
      .select({ total: count() })
      .from(posts)
      .where(and(eq(posts.workspaceId, wsId), eq(posts.status, "scheduled"), gte(posts.scheduledAt, now), lte(posts.scheduledAt, weekAhead)));

    // Workspace owners
    const owners = await db
      .select({ userId: workspaceMemberships.userId })
      .from(workspaceMemberships)
      .where(and(eq(workspaceMemberships.workspaceId, wsId), eq(workspaceMemberships.workspaceRole, "owner")));

    // Workspace name
    const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, wsId));

    const html = renderEmail({
      workspaceName: ws?.name ?? "Your workspace",
      published: byStat["published"] ?? 0,
      failed: byStat["failed"] ?? 0,
      scheduled: byStat["scheduled"] ?? 0,
      repliesSent: replyRow?.total ?? 0,
      upcoming: upcomingRow?.total ?? 0,
    });

    for (const owner of owners) {
      summaries.push({ userId: owner.userId, workspaceId: wsId, html, subject: `Weekly summary — ${ws?.name ?? "SMM Agent"}` });
    }
  }

  return summaries;
}

function renderEmail(s: { workspaceName: string; published: number; failed: number; scheduled: number; repliesSent: number; upcoming: number }) {
  const base = getAppUrlFromEnv();
  const row = (label: string, val: number) => `<tr><td style="padding:6px 12px;color:#5f523f">${label}</td><td style="padding:6px 12px;font-weight:600;color:#171717;text-align:right">${val}</td></tr>`;
  return `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 16px">
<h2 style="color:#171717;margin:0 0 4px">Weekly Summary</h2>
<p style="color:#9b8c78;margin:0 0 24px;font-size:14px">${s.workspaceName} — last 7 days</p>
<table style="width:100%;border-collapse:collapse;background:#fafaf8;border-radius:8px">
${row("Published", s.published)}${row("Failed", s.failed)}${row("Scheduled", s.scheduled)}${row("Replies sent", s.repliesSent)}${row("Upcoming (next 7d)", s.upcoming)}
</table>
<div style="text-align:center;margin:28px 0">
<a href="${base}/dashboard" style="display:inline-block;padding:10px 24px;background:#171717;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">Open SMM Agent</a>
</div>
<p style="color:#9b8c78;font-size:12px;text-align:center;margin:0">You're receiving this because you own this workspace.</p>
</div>`;
}
