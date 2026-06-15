import crypto from "node:crypto";

import { db } from "@/db";
import { pipelineRuns, platforms, posts, postTargets, type PipelineStep } from "@/db/schema";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import type { PublishExecutionSummary } from "@/lib/pipeline/publish-service";
import {
  resolvePostStatusFromTargetResults,
  resolvePublishResultsStatus,
} from "@/lib/pipeline/status";
import {
  normalizePostPublishMetadata,
  resolveInstagramContentType,
  resolvePlatformMediaUrls,
  resolvePlatformOverride,
} from "@/lib/post-publish-metadata";
import { and, asc, eq, lte } from "drizzle-orm";

type ScheduledPost = typeof posts.$inferSelect;
type PublishTargetRow = {
  target: typeof postTargets.$inferSelect;
  platform: typeof platforms.$inferSelect;
};

function isVideoContent(contentType: string) {
  return contentType === "video" || contentType === "avatar_video";
}

function getMediaType(contentType: string, mediaUrl: string | null) {
  if (!mediaUrl) return undefined;
  return isVideoContent(contentType) ? "video" : "image";
}

function isXLikedAutopost(post: ScheduledPost) {
  return post.metadata?.source === "x-liked-autopost";
}

function getProviderLabel(provider: string) {
  if (provider === "bird") return "bird";
  if (provider === "direct") return "direct";
  return "late";
}

function resolveScheduledPostMediaUrls(
  post: ScheduledPost,
  target: Pick<PublishTargetRow["platform"], "id" | "type">
) {
  const metadata = normalizePostPublishMetadata(post.metadata);
  return resolvePlatformMediaUrls(
    metadata,
    target,
    isXLikedAutopost(post) ? undefined : post.mediaUrl
  );
}

function createStep(input: {
  platform: string;
  startedAt: Date;
  completedAt: Date;
  result: {
    success: boolean;
    classification?: string;
    error?: string | null;
  };
}): PipelineStep {
  return {
    name: `publish:${input.platform}`,
    status: input.result.success
      ? "completed"
      : input.result.classification === "disabled" ||
          input.result.classification === "duplicate"
        ? "skipped"
        : "failed",
    startedAt: input.startedAt.toISOString(),
    completedAt: input.completedAt.toISOString(),
    durationMs: input.completedAt.getTime() - input.startedAt.getTime(),
    output: input.result,
    error:
      input.result.classification === "disabled"
        ? undefined
        : input.result.error ?? undefined,
  };
}

async function publishScheduledPost(post: ScheduledPost) {
  const targets = await db
    .select({ target: postTargets, platform: platforms })
    .from(postTargets)
    .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
    .where(eq(postTargets.postId, post.id));

  if (targets.length === 0) return;

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const publishMetadata = normalizePostPublishMetadata(post.metadata);
  const steps: PipelineStep[] = [];
  const results = [];

  await db.insert(pipelineRuns).values({
    id: runId,
    workspaceId: post.workspaceId,
    scheduleId: null,
    postId: post.id,
    trigger: "scheduled-post",
    status: "running",
    steps: [],
    startedAt,
  });

  await db.update(posts).set({
    status: "publishing",
    updatedAt: startedAt,
  }).where(eq(posts.id, post.id));

  for (const { target, platform } of targets) {
    const stepStart = new Date();
    const override = resolvePlatformOverride(publishMetadata, platform);
    const content = (override.caption || post.content).trim();
    const platformMediaUrls = resolveScheduledPostMediaUrls(post, platform);
    const platformMediaUrl = platformMediaUrls[0] ?? undefined;

    const execution: PublishExecutionSummary = content
      ? await publishPlatformTargets([
          {
            platform,
            content,
            mediaUrl: platformMediaUrl,
            mediaUrls: platformMediaUrls,
            mediaType: getMediaType(post.contentType, platformMediaUrl ?? null),
            instagramContentType: resolveInstagramContentType({
              platformType: platform.type,
              format: override.format,
              contentType: post.contentType,
              mediaUrlCount: platformMediaUrls.length,
            }),
            platformFormat: override.format,
            threadLongPosts: override.format?.trim().toLowerCase() === "thread",
            firstComment: override.firstComment,
            collaborators: override.collaborators,
          },
        ])
      : {
          outcomes: [
            {
              platform: platform.type,
              provider: getProviderLabel(platform.provider),
              accountId: platform.accountId,
              success: false,
              classification: "validation_error" as const,
              error: "Scheduled post content is empty.",
              postUrl: undefined,
              postId: undefined,
            },
          ],
          published: [],
          errors: [
            {
              platform: platform.type,
              error: "Scheduled post content is empty.",
              classification: "validation_error" as const,
            },
          ],
        };

    const result = execution.outcomes[0];
    if (!result) continue;
    results.push(result);

    const stepEnd = new Date();
    steps.push(
      createStep({
        platform: platform.type,
        startedAt: stepStart,
        completedAt: stepEnd,
        result,
      })
    );

    await db.update(postTargets).set({
      status: result.success
        ? "published"
        : result.classification === "duplicate" ||
            result.classification === "disabled"
          ? "skipped"
          : "failed",
      publishedUrl: result.postUrl ?? null,
      platformPostId: result.postId ?? null,
      error: result.classification === "disabled" ? null : result.error ?? null,
      publishedAt: result.success ? stepEnd : null,
    }).where(eq(postTargets.id, target.id));
  }

  const completedAt = new Date();
  const postStatus = resolvePostStatusFromTargetResults(results);
  const runStatus = resolvePublishResultsStatus(results);
  const error = results
    .filter((result) => !result.success && result.classification !== "disabled")
    .map((result) => `${result.platform}: ${result.error ?? "Unknown error"}`)
    .join("; ");

  await db.update(pipelineRuns).set({
    status: runStatus,
    steps,
    error: error || null,
    durationMs: completedAt.getTime() - startedAt.getTime(),
    completedAt,
  }).where(eq(pipelineRuns.id, runId));

  await db.update(posts).set({
    status: postStatus,
    publishedAt:
      postStatus === "published" || postStatus === "partial_failure"
        ? completedAt
        : null,
    updatedAt: completedAt,
  }).where(eq(posts.id, post.id));
}

export async function processDueScheduledPosts(options: {
  now?: Date;
  limit?: number;
} = {}) {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 5;
  const duePosts = await db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "scheduled"), lte(posts.scheduledAt, now)))
    .orderBy(asc(posts.scheduledAt))
    .limit(limit);

  for (const post of duePosts) {
    await publishScheduledPost(post);
  }

  return { processed: duePosts.length };
}
