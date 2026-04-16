import { db } from "@/db";
import { dedupCache, pipelineRuns, schedules } from "@/db/schema";
import { runAvatarVideoJob } from "@/lib/pipeline/runners/avatar-video";
import { runImagePostJob } from "@/lib/pipeline/runners/image-post";
import { runReplyEngineJob } from "@/lib/pipeline/runners/reply-engine";
import { and, eq, gte, lt } from "drizzle-orm";
import crypto from "node:crypto";

type ScheduleRow = typeof schedules.$inferSelect;
type TriggerKind = "cron" | "manual" | "api";

export async function runScheduleJob(
  schedule: ScheduleRow,
  trigger: TriggerKind = "cron"
): Promise<void> {
  if (trigger === "cron") {
    const lock = await acquireCronRunLock(schedule.id);
    if (!lock.acquired) {
      console.warn(`[scheduler] duplicate cron suppressed for ${schedule.id}`);
      return;
    }

    if (await hasCronRunForCurrentMinute(schedule.id, lock.minuteStart)) {
      console.warn(`[scheduler] duplicate cron suppressed for ${schedule.id}`);
      return;
    }
  }

  if (schedule.jobType === "avatar_video") {
    await runAvatarVideoJob(schedule, trigger);
    return;
  }

  if (schedule.jobType === "image_post") {
    await runImagePostJob(schedule, trigger);
    return;
  }

  if (schedule.jobType === "text_post") {
    await runImagePostJob(schedule, trigger);
    return;
  }

  if (schedule.jobType === "reply_engine") {
    await runReplyEngineJob(schedule, trigger);
    return;
  }

  throw new Error(`Unknown job type: ${schedule.jobType}`);
}

async function acquireCronRunLock(scheduleId: string) {
  const minuteStart = new Date();
  minuteStart.setSeconds(0, 0);
  const key = `cron:${scheduleId}:${minuteStart.toISOString()}`;

  try {
    await db.insert(dedupCache).values({
      id: crypto.randomUUID(),
      key,
      source: "scheduler",
      createdAt: new Date(),
    });
    return { acquired: true, minuteStart };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE") || message.includes("constraint")) {
      return { acquired: false, minuteStart };
    }
    throw error;
  }
}

async function hasCronRunForCurrentMinute(scheduleId: string, minuteStart: Date) {
  const minuteEnd = new Date(minuteStart);
  minuteEnd.setMinutes(minuteEnd.getMinutes() + 1);

  const existing = await db.query.pipelineRuns.findFirst({
    where: and(
      eq(pipelineRuns.scheduleId, scheduleId),
      eq(pipelineRuns.trigger, "cron"),
      gte(pipelineRuns.startedAt, minuteStart),
      lt(pipelineRuns.startedAt, minuteEnd)
    ),
  });

  return Boolean(existing);
}
