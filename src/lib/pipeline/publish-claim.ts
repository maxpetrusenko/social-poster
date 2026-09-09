import "server-only";

import crypto from "node:crypto";
import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  approvalRequests,
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  workspaces,
  type PipelineStep,
} from "@/db/schema";
import {
  createPostApprovalRevision,
  normalizeApprovalWorkflowMode,
  selectCurrentApprovalRequest,
  shouldBlockPublishForApproval,
} from "@/lib/approvals";

export type PublishClaimMode = "manual" | "scheduled";

export type PublishTargetRow = {
  target: typeof postTargets.$inferSelect;
  platform: typeof platforms.$inferSelect;
};

export type AggregatedPostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "partial_failure"
  | "failed";

export type PublishClaimResult =
  | {
      kind: "claimed";
      post: typeof posts.$inferSelect;
      workspace: typeof workspaces.$inferSelect;
      targets: PublishTargetRow[];
      publishTargets: PublishTargetRow[];
      runId: string;
      startedAt: Date;
      approvalState: string;
    }
  | { kind: "not_found" }
  | { kind: "approval_blocked"; approvalState: string; reason: string }
  | { kind: "not_due" }
  | { kind: "publishing" }
  | { kind: "completed" }
  | { kind: "no_targets" }
  | { kind: "no_retryable_targets" }
  | { kind: "invalid_state"; status: string };

const CLAIMABLE_POST_STATUSES = [
  "draft",
  "scheduled",
  "failed",
  "partial_failure",
] as const;

export const DISABLED_TARGET_RETRY_MARKER =
  "disabled-target: re-enable this platform to retry";

type TargetDeliveryState = Pick<
  typeof postTargets.$inferSelect,
  "status" | "publishedAt" | "publishedUrl" | "platformPostId"
> & { error?: string | null };

export function isDeliveredTarget(
  target: Pick<
    typeof postTargets.$inferSelect,
    "status" | "publishedAt" | "publishedUrl" | "platformPostId"
  >
) {
  return Boolean(
    target.status === "published" ||
      target.publishedAt ||
      target.publishedUrl ||
      target.platformPostId
  );
}

export function isRetryableTarget(
  target: TargetDeliveryState
) {
  return (
    !isDeliveredTarget(target) &&
    (["pending", "failed"].includes(target.status) ||
      (target.status === "skipped" &&
        target.error?.startsWith(DISABLED_TARGET_RETRY_MARKER) === true))
  );
}

export function resolvePostStatusFromTargetRows(
  rows: TargetDeliveryState[],
  fallback: "draft" | "scheduled"
): AggregatedPostStatus {
  if (rows.some((row) => row.status === "publishing")) {
    return "publishing";
  }

  const delivered = rows.some(isDeliveredTarget);
  const retryable = rows.some(isRetryableTarget);
  if (delivered && retryable) return "partial_failure";
  if (delivered) return "published";
  if (rows.some((row) => row.status === "failed")) return "failed";
  return fallback;
}

export function claimPostForPublishing(input: {
  workspaceId: string;
  postId: string;
  mode: PublishClaimMode;
  now?: Date;
}): PublishClaimResult {
  const now = input.now ?? new Date();

  return db.transaction((tx) => {
    const post = tx
      .select()
      .from(posts)
      .where(and(eq(posts.id, input.postId), eq(posts.workspaceId, input.workspaceId)))
      .get();
    if (!post) return { kind: "not_found" };

    const workspace = tx
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, input.workspaceId))
      .get();
    if (!workspace) return { kind: "not_found" };

    const targets = tx
      .select({ target: postTargets, platform: platforms })
      .from(postTargets)
      .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
      .where(
        and(
          eq(postTargets.postId, input.postId),
          eq(platforms.workspaceId, input.workspaceId)
        )
      )
      .orderBy(asc(postTargets.createdAt), asc(postTargets.id))
      .all();

    const currentRevisionId = createPostApprovalRevision({
      content: post.content,
      title: post.title,
      contentType: post.contentType,
      mediaUrl: post.mediaUrl,
      sourceUrl: post.sourceUrl,
      profileId: post.profileId,
      metadata: post.metadata,
      targetIds: targets.map(({ target }) => target.platformId),
    });
    const approvalRows = tx
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.workspaceId, input.workspaceId),
          eq(approvalRequests.postId, input.postId)
        )
      )
      .all();
    const latestApprovalRequest = selectCurrentApprovalRequest(
      approvalRows,
      currentRevisionId
    );
    const approvalGuard = shouldBlockPublishForApproval({
      approvalWorkflowMode: normalizeApprovalWorkflowMode(
        workspace.approvalWorkflowMode
      ),
      approvalRequestStatus: latestApprovalRequest?.status,
    });
    if (approvalGuard.blocked) {
      return {
        kind: "approval_blocked",
        approvalState: approvalGuard.approvalState,
        reason: approvalGuard.reason ?? "Approval required before publish.",
      };
    }

    if (post.status === "publishing" || targets.some(({ target }) => target.status === "publishing")) {
      return { kind: "publishing" };
    }

    const delivered = targets.some(({ target }) => isDeliveredTarget(target));
    const retryableTargets = targets.filter(({ target }) => isRetryableTarget(target));
    if (post.status === "published" && retryableTargets.length === 0) {
      return { kind: "completed" };
    }

    if (input.mode === "scheduled" && (
      post.status !== "scheduled" ||
      !post.scheduledAt ||
      post.scheduledAt > now
    )) {
      return { kind: "not_due" };
    }

    const claimableStatus = CLAIMABLE_POST_STATUSES.includes(
      post.status as (typeof CLAIMABLE_POST_STATUSES)[number]
    );
    if (!claimableStatus && !(post.status === "published" && retryableTargets.length > 0)) {
      return { kind: "invalid_state", status: post.status };
    }

    if (targets.length === 0) return { kind: "no_targets" };
    if (retryableTargets.length === 0) {
      return delivered ? { kind: "completed" } : { kind: "no_retryable_targets" };
    }

    const claimWhere = input.mode === "scheduled"
      ? and(
          eq(posts.id, input.postId),
          eq(posts.workspaceId, input.workspaceId),
          eq(posts.status, "scheduled"),
          lte(posts.scheduledAt, now)
        )
      : and(
          eq(posts.id, input.postId),
          eq(posts.workspaceId, input.workspaceId),
          post.status === "published"
            ? eq(posts.status, "published")
            : inArray(posts.status, [...CLAIMABLE_POST_STATUSES])
        );
    const claim = tx
      .update(posts)
      .set({ status: "publishing", updatedAt: now })
      .where(claimWhere)
      .run();
    if (claim.changes !== 1) return { kind: "publishing" };

    const runId = crypto.randomUUID();
    tx.insert(pipelineRuns)
      .values({
        id: runId,
        workspaceId: input.workspaceId,
        scheduleId: null,
        postId: input.postId,
        trigger: input.mode === "scheduled" ? "scheduled-post" : "api",
        status: "running",
        steps: [] as PipelineStep[],
        startedAt: now,
      })
      .run();

    return {
      kind: "claimed",
      post,
      workspace,
      targets,
      publishTargets: retryableTargets,
      runId,
      startedAt: now,
      approvalState: approvalGuard.approvalState,
    };
  });
}
