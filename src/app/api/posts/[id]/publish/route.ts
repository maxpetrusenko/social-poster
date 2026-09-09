import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { pipelineRuns, posts, postTargets, type PipelineStep } from "@/db/schema";
import { requireApiWorkspacePublisher } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import {
  claimPostForPublishing,
  DISABLED_TARGET_RETRY_MARKER,
  resolvePostStatusFromTargetRows,
} from "@/lib/pipeline/publish-claim";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import type { PublishResult } from "@/lib/pipeline/publisher";
import {
  resolvePublishResultsStatus,
} from "@/lib/pipeline/status";
import {
  normalizePostPublishMetadata,
  resolveInstagramContentType,
  resolvePlatformMediaUrls,
  resolvePlatformOverride,
} from "@/lib/post-publish-metadata";
import { sendNotificationEmail } from "@/lib/notifications/send";
import { trackUsage } from "@/lib/usage";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspacePublisher();
  if (tenant instanceof NextResponse) return tenant;

  const { id: postId } = await params;
  const claim = claimPostForPublishing({
    workspaceId: tenant.currentWorkspace.id,
    postId,
    mode: "manual",
  });

  if (claim.kind !== "claimed") {
    if (claim.kind === "approval_blocked") {
      await recordTenantAuditEvent(tenant, {
        action: "post.publish.blocked",
        targetType: "post",
        targetId: postId,
        metadata: {
          status: "blocked",
          endpoint: `POST /api/posts/${postId}/publish`,
          href: `/dashboard/posts/${postId}`,
          approvalState: claim.approvalState,
          reason: claim.reason,
        },
      });
      return NextResponse.json(
        { error: claim.reason, approvalState: claim.approvalState },
        { status: 409 }
      );
    }

    if (claim.kind === "not_found") {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }
    if (claim.kind === "publishing") {
      return NextResponse.json(
        { error: "Post is already publishing. Wait for the current delivery attempt to finish." },
        { status: 409 }
      );
    }
    if (claim.kind === "completed") {
      return NextResponse.json(
        { error: "Post has already delivered all available targets." },
        { status: 409 }
      );
    }
    if (claim.kind === "no_targets") {
      return NextResponse.json({ error: "No platform targets for this post" }, { status: 400 });
    }
    if (claim.kind === "no_retryable_targets") {
      return NextResponse.json(
        { error: "No pending or failed platform targets can be retried." },
        { status: 409 }
      );
    }
    if (claim.kind === "invalid_state") {
      return NextResponse.json(
        { error: `Post cannot be published from status ${claim.status}.` },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: "Post is not ready to publish." }, { status: 409 });
  }

  const { post, targets, publishTargets, runId, startedAt } = claim;
  const steps: PipelineStep[] = [];
  const results: PublishResult[] = [];
  const publishMetadata = normalizePostPublishMetadata(post.metadata);

  for (const { target, platform } of publishTargets) {
    await db
      .update(postTargets)
      .set({ status: "publishing", error: null })
      .where(eq(postTargets.id, target.id));
    target.status = "publishing";

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

    const result = await publishOneTarget({
      platform,
      content: override.caption || post.content,
      mediaUrl: platformMediaUrl,
      mediaUrls: platformMediaUrls,
      mediaType: getMediaType(post.contentType, platformMediaUrl ?? null),
      instagramContentType,
      platformFormat: override.format,
      threadLongPosts: override.format?.trim().toLowerCase() === "thread",
      firstComment: override.firstComment,
      collaborators: override.collaborators,
    });
    results.push(result);

    const stepEnd = new Date();
    steps.push({
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
      error: result.classification === "disabled" ? undefined : result.error,
    });

    applyTargetResult(target, result, stepEnd);
    await persistTargetResult(target.id, result, stepEnd);

    if (!result.success && result.classification !== "disabled" && result.classification !== "duplicate") {
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
  const runStatus = results.some((result) => result.classification === "disabled")
    ? "failed"
    : resolvePublishResultsStatus(results);
  const postStatus = resolvePostStatusFromTargetRows(
    targets.map(({ target }) => target),
    post.scheduledAt && post.scheduledAt > completedAt ? "scheduled" : "draft"
  );

  await db
    .update(pipelineRuns)
    .set({
      status: runStatus,
      steps,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      completedAt,
    })
    .where(eq(pipelineRuns.id, runId));

  await db
    .update(posts)
    .set({
      status: postStatus,
      publishedAt:
        postStatus === "published" || postStatus === "partial_failure"
          ? post.publishedAt ?? completedAt
          : post.publishedAt,
      updatedAt: completedAt,
    })
    .where(and(eq(posts.id, postId), eq(posts.workspaceId, tenant.currentWorkspace.id)));

  for (let index = 0; index < results.length; index += 1) {
    if (results[index]?.success) {
      await trackUsage(
        tenant.currentWorkspace.id,
        "post_published",
        publishTargets[index]?.platform.id,
        { postId }
      );
    }
  }

  if (postStatus === "published" || postStatus === "partial_failure") {
    try {
      const { cancelDripIfDone } = await import("@/lib/marketing/drip");
      cancelDripIfDone(tenant.user.id, "welcome_3_first_post");
    } catch {
      // Non-critical.
    }
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
      attemptedTargetCount: publishTargets.length,
    },
  });

  return NextResponse.json({
    runId,
    steps,
    success: runStatus === "completed",
    postStatus,
  });
}

async function publishOneTarget(
  input: Parameters<typeof publishPlatformTargets>[0][number]
): Promise<PublishResult> {
  try {
    const execution = await publishPlatformTargets([input]);
    return execution.outcomes[0] ?? createAmbiguousResult(
      input.platform,
      "Provider returned no delivery outcome."
    );
  } catch (error) {
    return createAmbiguousResult(
      input.platform,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function createAmbiguousResult(
  platform: Parameters<typeof publishPlatformTargets>[0][number]["platform"],
  detail: string
): PublishResult {
  return {
    platform: platform.type,
    provider: platform.provider === "bird" ? "bird" : platform.provider === "direct" ? "direct" : "late",
    accountId: platform.accountId,
    success: false,
    classification: "network_error",
    error: `Delivery state is unknown: ${detail}`,
  };
}

function applyTargetResult(
  target: typeof postTargets.$inferSelect,
  result: PublishResult,
  completedAt: Date
) {
  if (result.success) {
    target.status = "published";
    target.publishedUrl = result.postUrl ?? null;
    target.platformPostId = result.postId ?? null;
    target.error = null;
    target.publishedAt = completedAt;
    return;
  }

  if (result.classification === "network_error") {
    target.status = "publishing";
    target.error = result.error ?? "Delivery state is unknown.";
    return;
  }

  target.status = result.classification === "disabled" || result.classification === "duplicate"
    ? "skipped"
    : "failed";
  target.error = result.classification === "disabled"
    ? DISABLED_TARGET_RETRY_MARKER
    : result.error ?? null;
}

async function persistTargetResult(
  targetId: string,
  result: PublishResult,
  completedAt: Date
) {
  if (result.success) {
    await db
      .update(postTargets)
      .set({
        status: "published",
        publishedUrl: result.postUrl ?? null,
        platformPostId: result.postId ?? null,
        error: null,
        publishedAt: completedAt,
      })
      .where(eq(postTargets.id, targetId));
    return;
  }

  if (result.classification === "network_error") {
    await db
      .update(postTargets)
      .set({
        status: "publishing",
        error: result.error ?? "Delivery state is unknown.",
      })
      .where(eq(postTargets.id, targetId));
    return;
  }

  await db
    .update(postTargets)
    .set({
      status: result.classification === "disabled" || result.classification === "duplicate"
        ? "skipped"
        : "failed",
      error: result.classification === "disabled"
        ? DISABLED_TARGET_RETRY_MARKER
        : result.error ?? null,
    })
    .where(eq(postTargets.id, targetId));
}

function isVideoContent(contentType: string) {
  return contentType === "video" || contentType === "avatar_video";
}

function getMediaType(contentType: string, mediaUrl: string | null) {
  if (!mediaUrl) return undefined;
  return isVideoContent(contentType) ? "video" : "image";
}
