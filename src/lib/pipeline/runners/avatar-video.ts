import { db } from "@/db";
import { pipelineRuns, posts, postTargets, schedules, platforms } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { getTopStories, markPosted } from "../feed-engine";
import { writeVoiceScript, writePostCaption } from "../script-writer";
import { generateTTS } from "../tts";
import { generateAvatar } from "../avatar";
import { renderVideo } from "../video-render";
import { uploadToCatbox } from "../upload";
import { publishPlatformTargets } from "../publish-service";
import {
  resolvePostStatusFromTargetResults,
  resolvePublishResultsStatus,
} from "../status";
import { getWorkspaceRssSettings } from "@/lib/rss-config";

export async function runAvatarVideoJob(
  schedule: typeof schedules.$inferSelect,
  trigger: "cron" | "manual" | "api" = "cron"
): Promise<void> {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const steps: PipelineStep[] = [];

  console.log(`[avatar-video] run ${runId} start`);

  // Create pipeline run
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

  // Resolve target platform rows from IDs
  const targetIds = (schedule.targetPlatformIds || []) as string[];
  const platformRows = await Promise.all(
    targetIds.map((pid) => db.query.platforms.findFirst({ where: eq(platforms.id, pid) }))
  );
  const targets = platformRows.filter(Boolean).map((platform) => platform!);
  const platformTypes = targets.map((platform) => platform.type);

  if (platformTypes.length === 0) {
    await fail(runId, steps, startedAt, "No target platforms");
    return;
  }

  try {
    const rssSettings = schedule.workspaceId
      ? await getWorkspaceRssSettings(schedule.workspaceId)
      : null;
    // 1. Feed
    const s1 = step("feed:pull");
    steps.push(s1);
    const stories = await getTopStories(1, { workspaceId: schedule.workspaceId });
    if (stories.length === 0) throw new Error("No stories");
    const story = stories[0];
    complete(s1, { title: story.title, score: story.score });

    // 2. Script
    const s2 = step("script:write");
    steps.push(s2);
    const voiceScript = writeVoiceScript(story);
    complete(s2, { chars: voiceScript.length });

    // 3. TTS
    const s3 = step("tts:generate");
    steps.push(s3);
    const audioBuffer = await generateTTS(voiceScript);
    const audioPath = join("/tmp", `audio-${runId}.wav`);
    writeFileSync(audioPath, audioBuffer);
    complete(s3, { bytes: audioBuffer.length });

    // 4. Avatar
    const s4 = step("avatar:generate");
    steps.push(s4);
    const avatarBuffer = await generateAvatar(audioBuffer);
    const avatarPath = join("/tmp", `avatar-${runId}.mp4`);
    writeFileSync(avatarPath, avatarBuffer);
    complete(s4, { bytes: avatarBuffer.length });

    // 5. Render
    const s5 = step("video:render");
    steps.push(s5);
    const videoBuffer = await renderVideo({
      headline: story.title,
      bullets: [],
      audioPath,
      avatarPath,
    });
    complete(s5, { bytes: videoBuffer.length });

    // 6. Upload
    const s6 = step("video:upload");
    steps.push(s6);
    const videoUrl = await uploadToCatbox(videoBuffer, `vid-${runId}.mp4`);
    complete(s6, { url: videoUrl });

    const scheduleConfig = (schedule.config || {}) as Record<string, unknown>;

    // 7. Publish
    const s7 = step("publish");
    steps.push(s7);
    const summary = await publishPlatformTargets(
      targets.map((platform) => ({
        platform,
        content: writePostCaption(story, platform.type, rssSettings ?? undefined),
        mediaUrl: videoUrl,
        mediaType: "video" as const,
        instagramContentType:
          platform.type === "instagram" ? getInstagramVideoType(scheduleConfig) : undefined,
      }))
    );
    const results = summary.outcomes;
    const ok = results.filter((r) => r.success).map((r) => r.platform);
    const failed = results.filter(
      (result) => !result.success && result.classification !== "disabled"
    );
    const skipped = results.filter(
      (result) => result.classification === "disabled"
    );
    complete(s7, {
      outcomes: results,
      published: summary.published,
      errors: summary.errors,
    });
    if (failed.length > 0) {
      s7.status = "failed";
      s7.error = failed.map((result) => `${result.platform}: ${result.error}`).join("; ");
    } else if (skipped.length > 0) {
      s7.status = "skipped";
    }

    // Dedup
    await markPosted(story);

    // Cleanup temp
    try { unlinkSync(audioPath); } catch {}
    try { unlinkSync(avatarPath); } catch {}

    // Persist post + per-platform targets
    const postId = crypto.randomUUID();
    const now = new Date();
    const publishInputs = targets.map((platform) => ({
      platform,
      content: writePostCaption(story, platform.type, rssSettings ?? undefined),
      mediaUrl: videoUrl,
    }));
    const firstContent =
      publishInputs.find((t) =>
        results.find((r) => r.platform === t.platform.type && r.success)
      )?.content ?? publishInputs[0]?.content ?? story.title ?? "";
    const postStatus = resolvePostStatusFromTargetResults(results);

    await db.insert(posts).values({
      id: postId,
      workspaceId: schedule.workspaceId,
      title: story.title,
      content: firstContent,
      contentType: "avatar_video",
      mediaUrl: videoUrl,
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

    for (const target of targets) {
      const result = results.find(
        (r) => r.platform === target.type
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
        platformId: target.id,
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

    console.log(`[avatar-video] run ${runId} done — ${ok.length}/${results.length} → post ${postId}`);
  } catch (err) {
    await fail(runId, steps, startedAt, err instanceof Error ? err.message : String(err));
  }
}

function step(name: string): PipelineStep {
  return { name, status: "running", startedAt: new Date().toISOString() };
}

function complete(s: PipelineStep, output?: unknown) {
  s.status = "completed";
  s.completedAt = new Date().toISOString();
  s.durationMs = new Date(s.completedAt).getTime() - new Date(s.startedAt!).getTime();
  s.output = output;
}

async function fail(runId: string, steps: PipelineStep[], startedAt: Date, error: string) {
  console.error(`[avatar-video] run ${runId} FAILED: ${error}`);
  const now = new Date();
  await db.update(pipelineRuns).set({
    status: "failed",
    steps,
    error,
    durationMs: now.getTime() - startedAt.getTime(),
    completedAt: now,
  }).where(eq(pipelineRuns.id, runId));
}
function getInstagramVideoType(config: Record<string, unknown>): "reel" | "story" {
  return config.instagramVideoContentType === "story" ? "story" : "reel";
}
