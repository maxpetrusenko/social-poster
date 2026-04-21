import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  replyEvents,
  schedules,
} from "@/db/schema";
import { relativeTime } from "@/lib/utils";

export type ActionLogRow = {
  id: string;
  action: string;
  status: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
  endpoint: string;
  platform: string;
  account: string;
  createdAt: Date;
  createdLabel: string;
  traceId: string | null;
  traceUrl: string | null;
};

function statusTone(status: string): ActionLogRow["statusTone"] {
  const normalized = status.toLowerCase();
  if (["200", "success", "completed", "published", "sent", "created", "scheduled"].includes(normalized)) return "success";
  if (["running", "pending", "publishing", "draft"].includes(normalized)) return "warning";
  if (["failed", "error", "partial_failure"].includes(normalized)) return "danger";
  return "neutral";
}

function humanizeAction(action: string) {
  const label = action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function traceFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const candidate = metadata?.langsmithTrace ?? metadata?.trace;
  if (!candidate || typeof candidate !== "object") {
    return { traceId: null, traceUrl: null };
  }

  const trace = candidate as { runId?: unknown; id?: unknown; url?: unknown };
  return {
    traceId: typeof trace.runId === "string" ? trace.runId : typeof trace.id === "string" ? trace.id : null,
    traceUrl: typeof trace.url === "string" ? trace.url : null,
  };
}

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
    .select()
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

  for (const audit of auditRows) {
    const metadata = audit.metadata ?? {};
    const trace = traceFromMetadata(metadata);
    rows.push(
      row({
        id: `audit:${audit.id}`,
        action: humanizeAction(audit.action),
        status: typeof metadata.status === "string" ? metadata.status : "created",
        endpoint: typeof metadata.endpoint === "string" ? metadata.endpoint : audit.targetType,
        platform: typeof metadata.platform === "string" ? metadata.platform : "ClawPoster",
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
