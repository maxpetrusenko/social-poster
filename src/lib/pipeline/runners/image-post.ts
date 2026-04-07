import { db } from "@/db";
import { pipelineRuns, schedules, platforms } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

import { getTopStories, markPosted } from "../feed-engine";
import { writePostCaption } from "../script-writer";
import { publishToLate } from "../publisher";

export async function runImagePostJob(
  schedule: typeof schedules.$inferSelect
): Promise<void> {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const steps: PipelineStep[] = [];

  console.log(`[image-post] run ${runId} start`);

  await db.insert(pipelineRuns).values({
    id: runId,
    scheduleId: schedule.id,
    postId: null,
    trigger: "cron",
    status: "running",
    steps: [],
    startedAt,
  });

  const targetIds = (schedule.targetPlatformIds || []) as string[];
  const platformRows = await Promise.all(
    targetIds.map((pid) => db.query.platforms.findFirst({ where: eq(platforms.id, pid) }))
  );
  const platformTypes = platformRows.filter(Boolean).map((p) => p!.type);

  if (platformTypes.length === 0) {
    await fail(runId, steps, startedAt, "No target platforms");
    return;
  }

  try {
    // 1. Feed
    const s1: PipelineStep = { name: "feed:pull", status: "running", startedAt: new Date().toISOString() };
    steps.push(s1);
    const stories = await getTopStories(1);
    if (stories.length === 0) throw new Error("No stories");
    const story = stories[0];
    s1.status = "completed";
    s1.completedAt = new Date().toISOString();
    s1.output = { title: story.title, score: story.score };

    // 2. Caption
    const s2: PipelineStep = { name: "caption:write", status: "running", startedAt: new Date().toISOString() };
    steps.push(s2);
    const caption = writePostCaption(story, platformTypes[0]);
    s2.status = "completed";
    s2.completedAt = new Date().toISOString();
    s2.output = { chars: caption.length };

    // 3. Publish (text only)
    const s3: PipelineStep = { name: "publish", status: "running", startedAt: new Date().toISOString() };
    steps.push(s3);
    const results = await publishToLate({ content: caption, platforms: platformTypes });
    const ok = results.filter((r) => r.success).map((r) => r.platform);
    s3.status = "completed";
    s3.completedAt = new Date().toISOString();
    s3.output = { published: ok };

    await markPosted(story);

    const now = new Date();
    await db.update(pipelineRuns).set({
      status: ok.length > 0 ? "completed" : "failed",
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
