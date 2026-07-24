import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  activityLog,
  auditEvents,
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  replyEvents,
  schedules,
} from "@/db/schema";
import {
  humanizeAction,
  statusTone,
  traceFromMetadata,
  type ActionLogStatusTone,
} from "@/lib/dashboard/action-log-format";
import { relativeTime } from "@/lib/utils";

export type ActionLogRow = {
  id: string;
  action: string;
  status: string;
  statusTone: ActionLogStatusTone;
  endpoint: string;
  platform: string;
  account: string;
  createdAt: Date;
  createdLabel: string;
  traceId: string | null;
  traceUrl: string | null;
};

function row(input: Omit<ActionLogRow, "createdLabel" | "statusTone">): ActionLogRow {
  return {
    ...input,
    statusTone: statusTone(input.status),
    createdLabel: relativeTime(input.createdAt),
  };
}

export async function getLatestActionLogRows(input: {
  workspaceId: string;
  organizationId: string;
  limit?: number;
}): Promise<ActionLogRow[]> {
  const limit = input.limit ?? 80;

  const activityRows = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.workspaceId, input.workspaceId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);

  const auditRows = await db
    .select()
    .from(auditEvents)
    .where(
      or(
        eq(auditEvents.workspaceId, input.workspaceId),
        and(eq(auditEvents.organizationId, input.organizationId), eq(auditEvents.targetType, "llm"))
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(limit);

  const postRows = await db
    .select()
    .from(posts)
    .where(eq(posts.workspaceId, input.workspaceId))
    .orderBy(desc(posts.updatedAt))
    .limit(limit);

  const scheduleRows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.workspaceId, input.workspaceId))
    .orderBy(desc(schedules.updatedAt))
    .limit(limit);

  const replyRows = await db
    .select({
      id: replyEvents.id,
      tweetUrl: replyEvents.tweetUrl,
      replyUrl: replyEvents.replyUrl,
      authorHandle: replyEvents.authorHandle,
      status: replyEvents.status,
      createdAt: replyEvents.createdAt,
    })
    .from(replyEvents)
    .where(eq(replyEvents.workspaceId, input.workspaceId))
    .orderBy(desc(replyEvents.createdAt))
    .limit(limit);

  const runRows = await db
    .select()
    .from(pipelineRuns)
    .where(eq(pipelineRuns.workspaceId, input.workspaceId))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);

  const postIds = postRows.map((post) => post.id);
  const targetRows = postIds.length
    ? await db
        .select({ target: postTargets, platform: platforms })
        .from(postTargets)
        .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
        .where(inArray(postTargets.postId, postIds))
    : [];

  const platformsByPostId = new Map<string, string[]>();
  for (const entry of targetRows) {
    const labels = platformsByPostId.get(entry.target.postId) ?? [];
    labels.push(entry.platform.name || entry.platform.type);
    platformsByPostId.set(entry.target.postId, labels);
  }

  const rows: ActionLogRow[] = [];
  const mirroredAuditEventIds = new Set<string>();

  for (const activity of activityRows) {
    const metadata = activity.metadata ?? {};
    if (typeof metadata.auditEventId === "string") {
      mirroredAuditEventIds.add(metadata.auditEventId);
    }
    const trace = traceFromMetadata(metadata);
    rows.push(
      row({
        id: `activity:${activity.id}`,
        action: activity.subject || humanizeAction(activity.eventType),
        status: typeof metadata.status === "string" ? metadata.status : activity.severity,
        endpoint:
          typeof metadata.href === "string"
            ? metadata.href
            : typeof metadata.endpoint === "string"
              ? metadata.endpoint
              : activity.entityType ?? activity.source,
        platform: typeof metadata.platform === "string" ? metadata.platform : activity.source,
        account: typeof metadata.account === "string" ? metadata.account : "Workspace",
        createdAt: activity.createdAt,
        traceId: trace.traceId,
        traceUrl: trace.traceUrl,
      })
    );
  }

  for (const audit of auditRows) {
    if (mirroredAuditEventIds.has(audit.id)) continue;

    const metadata = audit.metadata ?? {};
    const trace = traceFromMetadata(metadata);
    rows.push(
      row({
        id: `audit:${audit.id}`,
        action: humanizeAction(audit.action),
        status: typeof metadata.status === "string" ? metadata.status : "created",
        endpoint:
          typeof metadata.href === "string"
            ? metadata.href
            : typeof metadata.endpoint === "string"
              ? metadata.endpoint
              : audit.targetType,
        platform: typeof metadata.platform === "string" ? metadata.platform : "SMM Agent",
        account: audit.actorEmail ?? "System",
        createdAt: audit.createdAt,
        traceId: trace.traceId,
        traceUrl: trace.traceUrl,
      })
    );
  }

  for (const post of postRows) {
    const platformLabel = platformsByPostId.get(post.id)?.join(", ") || "No targets";

    rows.push(
      row({
        id: `post:create:${post.id}`,
        action: "Post created",
        status: post.status,
        endpoint: `/dashboard/posts/${post.id}`,
        platform: platformLabel,
        account: "Workspace",
        createdAt: post.createdAt,
        traceId: null,
        traceUrl: null,
      })
    );

    if (post.scheduledAt) {
      rows.push(
        row({
          id: `post:schedule:${post.id}`,
          action: "Post scheduled",
          status: "scheduled",
          endpoint: `/dashboard/posts/${post.id}`,
          platform: platformLabel,
          account: "Workspace",
          createdAt: post.scheduledAt,
          traceId: null,
          traceUrl: null,
        })
      );
    }

    if (post.publishedAt) {
      rows.push(
        row({
          id: `post:publish:${post.id}`,
          action: "Post published",
          status: "published",
          endpoint: `/dashboard/posts/${post.id}`,
          platform: platformLabel,
          account: "Workspace",
          createdAt: post.publishedAt,
          traceId: null,
          traceUrl: null,
        })
      );
    }
  }

  for (const schedule of scheduleRows) {
    rows.push(
      row({
        id: `schedule:${schedule.id}`,
        action: "Schedule created",
        status: schedule.enabled ? "scheduled" : "paused",
        endpoint: `/dashboard/schedules/${schedule.id}`,
        platform: Array.isArray(schedule.targetPlatformIds) && schedule.targetPlatformIds.length ? `${schedule.targetPlatformIds.length} targets` : "No targets",
        account: schedule.name,
        createdAt: schedule.createdAt,
        traceId: null,
        traceUrl: null,
      })
    );
  }

  for (const reply of replyRows) {
    rows.push(
      row({
        id: `reply:${reply.id}`,
        action: reply.status === "sent" ? "Reply posted" : `Reply ${reply.status}`,
        status: reply.status,
        endpoint: reply.replyUrl ?? reply.tweetUrl,
        platform: "X",
        account: reply.authorHandle,
        createdAt: reply.createdAt,
        traceId: null,
        traceUrl: null,
      })
    );
  }

  for (const run of runRows) {
    const trace = traceFromMetadata(
      Array.isArray(run.steps)
        ? (run.steps.find((step) => {
            const output = step.output;
            return output && typeof output === "object" && "langsmithTrace" in output;
          })?.output as Record<string, unknown> | undefined)
        : undefined
    );

    rows.push(
      row({
        id: `run:${run.id}`,
        action: `Pipeline ${run.trigger}`,
        status: run.status,
        endpoint: run.postId ? `/dashboard/posts/${run.postId}` : "pipeline",
        platform: run.scheduleId ? "Scheduled run" : "Manual run",
        account: run.durationMs ? `${run.durationMs}ms` : "Running",
        createdAt: run.completedAt ?? run.startedAt,
        traceId: trace.traceId,
        traceUrl: trace.traceUrl,
      })
    );
  }

  return rows
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, limit);
}
