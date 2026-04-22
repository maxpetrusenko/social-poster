import { db } from "@/db";
import { posts, postTargets, platforms, pipelineRuns } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { requireApiWorkspacePublisher } from "@/lib/api-authorization";
import { getLatestApprovalRequestForPost } from "@/lib/approval-requests";
import { normalizeApprovalWorkflowMode, shouldBlockPublishForApproval } from "@/lib/approvals";
import { recordTenantAuditEvent } from "@/lib/audit";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import {
  normalizePostPublishMetadata,
  resolveInstagramContentType,
  resolvePlatformMediaUrls,
  resolvePlatformOverride,
} from "@/lib/post-publish-metadata";
import { trackUsage } from "@/lib/usage";
import { sendNotificationEmail } from "@/lib/notifications/send";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  resolvePostStatusFromTargetResults,
  resolvePublishResultsStatus,
} from "@/lib/pipeline/status";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspacePublisher();
  if (tenant instanceof NextResponse) return tenant;

  const { id: postId } = await params;
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, postId), eq(posts.workspaceId, tenant.currentWorkspace.id)),
  });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const latestApprovalRequest = await getLatestApprovalRequestForPost({
    workspaceId: tenant.currentWorkspace.id,
    postId,
  });
  const approvalGuard = shouldBlockPublishForApproval({
    approvalWorkflowMode: normalizeApprovalWorkflowMode(
      tenant.currentWorkspace.approvalWorkflowMode
    ),
    approvalRequestStatus: latestApprovalRequest?.status,
  });

  if (approvalGuard.blocked) {
    await recordTenantAuditEvent(tenant, {
      action: "post.publish.blocked",
      targetType: "post",
      targetId: postId,
      metadata: {
        status: "blocked",
        endpoint: `POST /api/posts/${postId}/publish`,
        href: `/dashboard/posts/${postId}`,
        approvalState: approvalGuard.approvalState,
        reason: approvalGuard.reason,
      },
    });

    return NextResponse.json(
      {
        error: approvalGuard.reason ?? "Approval required before publish.",
        approvalState: approvalGuard.approvalState,
      },
      { status: 409 }
    );
  }

  const targets = db
    .select({ target: postTargets, platform: platforms })
    .from(postTargets)
    .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
    .where(eq(postTargets.postId, postId))
    .all();

  if (targets.length === 0) {
    return NextResponse.json({ error: "No platform targets for this post" }, { status: 400 });
  }

  // Create pipeline run
  const runId = crypto.randomUUID();
  const now = new Date();
  const steps: PipelineStep[] = [];

  await db.insert(pipelineRuns).values({
    id: runId,
    workspaceId: tenant.currentWorkspace.id,
    scheduleId: null,
    postId,
    trigger: "api",
    status: "running",
    steps: [],
    startedAt: now,
  });

  // Update post status
  await db.update(posts).set({ status: "publishing", updatedAt: now }).where(eq(posts.id, postId));

  const results = [];
  const publishMetadata = normalizePostPublishMetadata(post.metadata);

  for (const { target, platform } of targets) {
    const stepName = `publish:${platform.type}`;
    const stepStart = new Date();
    const override = resolvePlatformOverride(publishMetadata, platform);
    const platformMediaUrls = resolvePlatformMediaUrls(
      publishMetadata,
      platform,
      post.mediaUrl
    );
    const platformMediaUrl = platformMediaUrls[0] ?? undefined;
    const instagramContentType = resolveInstagramContentType({
      platformType: platform.type,
      format: override.format,
      contentType: post.contentType,
      mediaUrlCount: platformMediaUrls.length,
    });

    const execution = await publishPlatformTargets([
      {
        platform,
        content: override.caption || post.content,
        mediaUrl: platformMediaUrl,
        mediaUrls: platformMediaUrls,
        mediaType: getMediaType(post.contentType, platformMediaUrl ?? null),
        instagramContentType,
        platformFormat: override.format,
        firstComment: override.firstComment,
        collaborators: override.collaborators,
      },
    ]);
    const result = execution.outcomes[0];
    results.push(result);

    const stepEnd = new Date();
    const step: PipelineStep = {
      name: stepName,
      status: result.success
        ? "completed"
        : result.classification === "disabled" || result.classification === "duplicate"
          ? "skipped"
          : "failed",
      startedAt: stepStart.toISOString(),
      completedAt: stepEnd.toISOString(),
      durationMs: stepEnd.getTime() - stepStart.getTime(),
      output: result,
      error:
        result.classification === "disabled" ? undefined : result.error,
    };
    steps.push(step);

    // Update target status
    await db.update(postTargets).set({
      status: result.success
        ? "published"
        : result.classification === "duplicate" ||
            result.classification === "disabled"
          ? "skipped"
          : "failed",
      publishedUrl: result.postUrl ?? null,
      platformPostId: result.postId ?? null,
      error:
        result.classification === "disabled" ? null : result.error ?? null,
      publishedAt: result.success ? stepEnd : null,
    }).where(eq(postTargets.id, target.id));

    if (
      !result.success &&
      result.classification !== "disabled" &&
      result.classification !== "duplicate"
    ) {
      await sendNotificationEmail({
        userId: tenant.user.id,
        workspaceId: tenant.currentWorkspace.id,
        type: "post_failure",
        data: {
          title: post.title ?? post.content.slice(0, 60),
          platform: platform.name,
          message: result.error ?? "Unknown publish error",
          href: `/dashboard/posts/${postId}`,
        },
        dedupeKey: `post_target:${target.id}:failed`,
      });
    }
  }

  const completedAt = new Date();
  const runStatus = resolvePublishResultsStatus(results);
  const hasActionableResults = results.some(
    (result) => result.classification !== "disabled"
  );
  const postStatus = hasActionableResults
    ? resolvePostStatusFromTargetResults(results)
    : post.scheduledAt && post.scheduledAt > completedAt
      ? "scheduled"
      : "draft";

  // Update pipeline run
  await db.update(pipelineRuns).set({
    status: runStatus,
    steps,
    durationMs: completedAt.getTime() - now.getTime(),
    completedAt,
  }).where(eq(pipelineRuns.id, runId));

  // Update post status
  await db.update(posts).set({
    status: postStatus,
    publishedAt:
      postStatus === "published" || postStatus === "partial_failure"
        ? completedAt
        : null,
    updatedAt: completedAt,
  }).where(eq(posts.id, postId));

  // Track usage for each successful publish
  for (let i = 0; i < results.length; i++) {
    if (results[i]?.success) {
      await trackUsage(tenant.currentWorkspace.id, "post_published", targets[i]?.platform.id, { postId });
    }
  }

  // Cancel "first post" drip if this was a successful publish
  if (postStatus === "published" || postStatus === "partial_failure") {
    try {
      const { cancelDripIfDone } = await import("@/lib/marketing/drip");
      cancelDripIfDone(tenant.user.id, "welcome_3_first_post");
    } catch { /* non-critical */ }
  }

  await recordTenantAuditEvent(tenant, {
    action: "post.publish",
    targetType: "post",
    targetId: postId,
    metadata: {
      status: postStatus,
      endpoint: `POST /api/posts/${postId}/publish`,
      runId,
      platformTargetCount: targets.length,
    },
  });

  return NextResponse.json({
    runId,
    steps,
    success: runStatus === "completed",
    postStatus,
  });
}

function isVideoContent(contentType: string) {
  return contentType === "video" || contentType === "avatar_video";
}

function getMediaType(contentType: string, mediaUrl: string | null) {
  if (!mediaUrl) return undefined;
  return isVideoContent(contentType) ? "video" : "image";
}
