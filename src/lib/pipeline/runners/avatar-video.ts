import { db } from "@/db";
import { pipelineRuns, schedules, platforms } from "@/db/schema";
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
import { publishToLate } from "../publisher";

export async function runAvatarVideoJob(
  schedule: typeof schedules.$inferSelect
): Promise<void> {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const steps: PipelineStep[] = [];

  console.log(`[avatar-video] run ${runId} start`);

  // Create pipeline run
  await db.insert(pipelineRuns).values({
    id: runId,
    scheduleId: schedule.id,
    postId: null,
    trigger: "cron",
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
    // 1. Feed
    const s1 = step("feed:pull");
    steps.push(s1);
    const stories = await getTopStories(1);
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
    const results = await publishToLate(
      targets.map((platform) => ({
        platform: platform.type,
        accountId: platform.accountId,
        content: writePostCaption(story, platform.type),
        mediaUrl: videoUrl,
        mediaType: "video" as const,
        instagramContentType:
          platform.type === "instagram" ? getInstagramVideoType(scheduleConfig) : undefined,
      }))
    );
    const ok = results.filter((r) => r.success).map((r) => r.platform);
    const failed = results.filter((r) => !r.success);
    complete(s7, { published: ok, errors: failed.map((r) => `${r.platform}: ${r.error}`) });

    // Dedup
    await markPosted(story);

    // Cleanup temp
    try { unlinkSync(audioPath); } catch {}
    try { unlinkSync(avatarPath); } catch {}

    // Done
    const now = new Date();
    await db.update(pipelineRuns).set({
      status: failed.length === results.length ? "failed" : "completed",
      steps,
      durationMs: now.getTime() - startedAt.getTime(),
      completedAt: now,
    }).where(eq(pipelineRuns.id, runId));

    console.log(`[avatar-video] run ${runId} done — ${ok.length}/${results.length} platforms`);
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
