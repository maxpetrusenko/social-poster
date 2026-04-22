import { db } from "@/db";
import { pipelineRuns, posts, postTargets, schedules, platforms } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import {
  getTopStories,
  markPosted,
  markDedupKeys,
  resolveStoryImageUrl,
} from "../feed-engine";
import { resolveAgentPersonaScheduleContent } from "../agent-persona-updates";
import { resolveFixedScheduleContent } from "../fixed-schedule-post";
import { writePostCaption } from "../script-writer";
import { publishPlatformTargets } from "../publish-service";
import {
  resolvePostStatusFromTargetResults,
  resolvePublishResultsStatus,
} from "../status";
import { appendSourceLink, publishFirstComment } from "../first-comment";
import { enrichSummaryIfNeeded } from "../enrich-summary";
import type { Story } from "../feed-engine";
import { getWorkspaceRssSettings } from "@/lib/rss-config";
import { selectFeedStoryForSchedule } from "./feed-story-selection";

async function resolveStoryImages(
  stories: Story[],
  options: { requireImage: boolean; imageSelectionMode: "prefer_feed" | "prefer_open_graph" | "feed_only" }
) {
  if (!options.requireImage) return stories;

  return Promise.all(
    stories.map(async (story) => ({
      ...story,
      imageUrl: (await resolveStoryImageUrl(story, options.imageSelectionMode)) ?? undefined,
    }))
  );
}

export async function runImagePostJob(
  schedule: typeof schedules.$inferSelect,
  trigger: "cron" | "manual" | "api" = "cron"
): Promise<void> {
  const priorRuns = await db
    .select({ id: pipelineRuns.id })
    .from(pipelineRuns)
    .where(eq(pipelineRuns.scheduleId, schedule.id));

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const steps: PipelineStep[] = [];

  console.log(`[image-post] run ${runId} start`);

  await db.insert(pipelineRuns).values({
    id: runId,
    workspaceId: schedule.workspaceId,
    scheduleId: schedule.id,
    postId: null,
    trigger,
    status: "running",
    steps: [],
    startedAt,
  });

  const targetIds = (schedule.targetPlatformIds || []) as string[];
  const platformRows = await Promise.all(
    targetIds.map((pid) => db.query.platforms.findFirst({ where: eq(platforms.id, pid) }))
  );
  const targets = platformRows.filter(Boolean).map((platform) => platform!);

  if (targets.length === 0) {
    await fail(runId, steps, startedAt, "No target platforms");
    return;
  }

  try {
    const rssSettings = schedule.workspaceId
      ? await getWorkspaceRssSettings(schedule.workspaceId)
      : null;
    const scheduledContent =
      (await resolveAgentPersonaScheduleContent(
        schedule.config,
        targets.map((platform) => platform.type),
        startedAt
      )) ||
      resolveFixedScheduleContent(
      schedule.config,
      targets.map((platform) => platform.type),
      priorRuns.length,
      startedAt
      );

    // 1. Content source
    const s1: PipelineStep = {
      name: scheduledContent ? "content:load" : "feed:pull",
      status: "running",
      startedAt: new Date().toISOString(),
    };
    steps.push(s1);
    const story = scheduledContent
      ? {
          title: scheduledContent.title,
          summary: scheduledContent.summary,
          score: 100,
          link: "",
        }
      : await (async () => {
          const stories = await getTopStories(
            schedule.jobType === "image_post" ? 8 : 1,
            { workspaceId: schedule.workspaceId }
          );
          const resolvedStories = await resolveStoryImages(stories, {
            requireImage: schedule.jobType === "image_post",
            imageSelectionMode:
              rssSettings?.imageSelectionMode ?? "prefer_feed",
          });
          const selectedStory = selectFeedStoryForSchedule(resolvedStories, {
            requireImage: schedule.jobType === "image_post",
          });
          if (!selectedStory) {
            throw new Error(
              schedule.jobType === "image_post" ? "No stories with image" : "No stories"
            );
          }
          return selectedStory;
        })();
    s1.status = "completed";
    s1.completedAt = new Date().toISOString();
    s1.output = scheduledContent
      ? {
          title: scheduledContent.title,
          summary: scheduledContent.summary,
          variantIndex: scheduledContent.variantIndex,
          contentByPlatform: scheduledContent.contentByPlatform,
          mediaUrlByPlatform: scheduledContent.mediaUrlByPlatform,
          instagramContentTypeByPlatform:
            scheduledContent.instagramContentTypeByPlatform,
        }
      : {
          title: story.title,
          summary: story.summary,
          link: story.link,
          score: story.score,
          imageUrl: story.imageUrl ?? null,
          sourceName: story.sourceName ?? null,
        };

    // 1b. Enrich summary if RSS gave us garbage
    const enrichedSummary =
      !scheduledContent && story.link
        ? await enrichSummaryIfNeeded(story, schedule.workspaceId)
        : story.summary;
    const enrichedStory = { ...story, summary: enrichedSummary };

    // 2. Caption
    const s2: PipelineStep = { name: "caption:write", status: "running", startedAt: new Date().toISOString() };
    steps.push(s2);
    const publishTargets = targets.map((platform) => {
      const platformType = platform.type === "x" ? "twitter" : platform.type;
      const mediaUrl =
        scheduledContent?.mediaUrlByPlatform[platformType] ??
        story.imageUrl ??
        undefined;

      const rawContent = scheduledContent
        ? scheduledContent.contentByPlatform[platformType] || scheduledContent.title
        : writePostCaption(enrichedStory, platform.type, rssSettings ?? undefined);

      // Append source link for non-X platforms (X gets it as a first comment)
      const content = story.link
        ? appendSourceLink(rawContent, story.link, platform.type)
        : rawContent;

      return {
        platform,
        content,
        mediaUrl,
        mediaType: mediaUrl ? ("image" as const) : undefined,
        instagramContentType:
          platform.type === "instagram"
            ? scheduledContent?.instagramContentTypeByPlatform.instagram
            : undefined,
      };
    });
    s2.status = "completed";
    s2.completedAt = new Date().toISOString();
    s2.output = {
      captions: publishTargets.map((target) => ({
        platform: target.platform.type,
        chars: target.content.length,
        content: target.content,
        mediaUrl: target.mediaUrl ?? null,
        mediaType: target.mediaType ?? null,
        instagramContentType: target.instagramContentType ?? null,
      })),
    };

    // 3. Publish (text only)
    const s3: PipelineStep = { name: "publish", status: "running", startedAt: new Date().toISOString() };
    steps.push(s3);
    const summary = await publishPlatformTargets(publishTargets);
    const results = summary.outcomes;
    const ok = results.filter((r) => r.success).map((r) => r.platform);
    const failed = results.filter(
      (result) => !result.success && result.classification !== "disabled"
    );
    const skipped = results.filter(
      (result) => result.classification === "disabled"
    );
    s3.status = failed.length > 0 ? "failed" : skipped.length > 0 ? "skipped" : "completed";
    s3.completedAt = new Date().toISOString();
    s3.output = {
      outcomes: results,
      published: summary.published,
      errors: summary.errors,
    };
    if (failed.length > 0) {
      s3.error = failed.map((result) => `${result.platform}: ${result.error}`).join("; ");
    }

    // 4. First comment (source link on X)
    if (story.link) {
      const commentTargets = publishTargets.filter((t) => {
        const pType = t.platform.type.toLowerCase();
        return pType === "x" || pType === "twitter";
      });

      for (const target of commentTargets) {
        const result = results.find(
          (r) => r.platform === target.platform.type && r.success
        );
        if (result) {
          const commentResult = await publishFirstComment({
            platform: target.platform,
            publishResult: result,
            sourceUrl: story.link,
            sourceTitle: story.title,
          });
          if (commentResult.success) {
            console.log(
              `[image-post] first comment on X: ${commentResult.commentUrl}`
            );
          }
        }
      }
    }

    if (!scheduledContent) {
      await markPosted(story);
    } else if (scheduledContent.dedupKeys && scheduledContent.dedupKeys.length > 0) {
      await markDedupKeys(scheduledContent.dedupKeys, scheduledContent.title);
    }

    // Persist post + per-platform targets so the calendar/posts pages can show them
    const postId = crypto.randomUUID();
    const now = new Date();
    const firstSuccessful = publishTargets.find((t) =>
      results.find((r) => r.platform === t.platform.type && r.success)
    );
    const postContent =
      firstSuccessful?.content ??
      publishTargets[0]?.content ??
      story.title ??
      "";
    const postMediaUrl =
      firstSuccessful?.mediaUrl ??
      publishTargets[0]?.mediaUrl ??
      story.imageUrl ??
      null;
    const postContentType =
      postMediaUrl
        ? schedule.jobType === "avatar_video"
          ? "avatar_video"
          : "image"
        : "text";
    const postStatus = resolvePostStatusFromTargetResults(results);

    await db.insert(posts).values({
      id: postId,
      workspaceId: schedule.workspaceId,
      title: story.title ?? schedule.name,
      content: postContent,
      contentType: postContentType,
      mediaUrl: postMediaUrl ?? null,
      sourceUrl: story.link || null,
      sourceTitle: story.title ?? null,
      status: postStatus,
      publishedAt:
        postStatus === "published" || postStatus === "partial_failure"
          ? now
          : null,
      metadata: {
        sourceScheduleId: schedule.id,
        runId,
      },
      createdAt: now,
      updatedAt: now,
    });

    for (const target of publishTargets) {
      const result = results.find(
        (r) => r.platform === target.platform.type
      );
      const targetStatus = result?.success
        ? "published"
        : result?.classification === "disabled" ||
            result?.classification === "duplicate"
          ? "skipped"
          : "failed";

      await db.insert(postTargets).values({
        id: crypto.randomUUID(),
        postId,
        platformId: target.platform.id,
        status: targetStatus,
        publishedUrl: result?.postUrl ?? null,
        platformPostId: result?.postId ?? null,
        error:
          result?.classification === "disabled"
            ? null
            : result?.error ?? null,
        publishedAt: result?.success ? now : null,
        createdAt: now,
      });
    }

    await db.update(pipelineRuns).set({
      status: resolvePublishResultsStatus(results),
      postId,
      steps,
      durationMs: now.getTime() - startedAt.getTime(),
      completedAt: now,
    }).where(eq(pipelineRuns.id, runId));

    console.log(`[image-post] run ${runId} done — ${ok.length}/${results.length} → post ${postId}`);
  } catch (err) {
    await fail(runId, steps, startedAt, err instanceof Error ? err.message : String(err));
  }
}

async function fail(runId: string, steps: PipelineStep[], startedAt: Date, error: string) {
  console.error(`[image-post] run ${runId} FAILED: ${error}`);
  await db.update(pipelineRuns).set({
    status: "failed", steps, error,
    durationMs: Date.now() - startedAt.getTime(),
    completedAt: new Date(),
  }).where(eq(pipelineRuns.id, runId));
}
