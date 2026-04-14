import { db } from "@/db";
import { pipelineRuns, schedules, platforms } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import { getTopStories, markPosted } from "../feed-engine";
import { resolveAgentPersonaScheduleContent } from "../agent-persona-updates";
import { resolveFixedScheduleContent } from "../fixed-schedule-post";
import { writePostCaption } from "../script-writer";
import { publishPlatformTargets } from "../publish-service";
import { resolvePublishResultsStatus } from "../status";

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
          const stories = await getTopStories(1);
          if (stories.length === 0) throw new Error("No stories");
          return stories[0];
        })();
    s1.status = "completed";
    s1.completedAt = new Date().toISOString();
    s1.output = scheduledContent
      ? {
          title: scheduledContent.title,
          variantIndex: scheduledContent.variantIndex,
          mediaUrlByPlatform: scheduledContent.mediaUrlByPlatform,
        }
      : { title: story.title, score: story.score };

    // 2. Caption
    const s2: PipelineStep = { name: "caption:write", status: "running", startedAt: new Date().toISOString() };
    steps.push(s2);
    const publishTargets = targets.map((platform) => {
      const platformType = platform.type === "x" ? "twitter" : platform.type;
      const mediaUrl = scheduledContent?.mediaUrlByPlatform[platformType] ?? undefined;

      return {
        platform,
        content: scheduledContent
          ? scheduledContent.contentByPlatform[platformType] || scheduledContent.title
          : writePostCaption(story, platform.type),
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

    if (!scheduledContent) {
      await markPosted(story);
    }

    const now = new Date();
    await db.update(pipelineRuns).set({
      status: resolvePublishResultsStatus(results),
      steps,
      durationMs: now.getTime() - startedAt.getTime(),
      completedAt: now,
    }).where(eq(pipelineRuns.id, runId));

    console.log(`[image-post] run ${runId} done — ${ok.length}/${results.length}`);
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
