import cron from "node-cron";
import { db } from "@/db";
import { pipelineRuns, schedules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runScheduleJob } from "./schedule-jobs";
import { finalizeAbandonedSteps } from "./pipeline/recovery";

type RegisteredScheduleTask = {
  cron: string;
  fingerprint: string;
  task: cron.ScheduledTask;
};

const tasks = new Map<string, RegisteredScheduleTask>();
const ABANDONED_RUN_ERROR = "Run interrupted by app restart before completion";
let didRecoverAbandonedRuns = false;

export async function initScheduler(): Promise<void> {
  console.log("[scheduler] init");
  await ensureRecoveredAbandonedRuns();
  await reconcileSchedules("init");

  console.log("[scheduler] ready");
}

export async function reconcileSchedules(reason = "manual"): Promise<void> {
  console.log(`[scheduler] reconciling (${reason})`);
  const rows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.enabled, true));
  const enabledById = new Map(rows.map((schedule) => [schedule.id, schedule]));

  for (const [scheduleId, registered] of tasks) {
    const nextSchedule = enabledById.get(scheduleId);

    if (!nextSchedule) {
      registered.task.stop();
      tasks.delete(scheduleId);
      console.log(`[scheduler] unregistered: ${scheduleId} (disabled or deleted)`);
      continue;
    }

    if (!cron.validate(nextSchedule.cron)) {
      registered.task.stop();
      tasks.delete(scheduleId);
      console.warn(
        `[scheduler] invalid cron "${nextSchedule.cron}" for ${nextSchedule.id}, removed from runtime`
      );
      continue;
    }

    if (
      registered.cron !== nextSchedule.cron ||
      registered.fingerprint !== buildScheduleFingerprint(nextSchedule)
    ) {
      registered.task.stop();
      tasks.delete(scheduleId);
      registerSchedule(nextSchedule);
    }
  }

  for (const schedule of rows) {
    if (tasks.has(schedule.id)) {
      continue;
    }

    if (!cron.validate(schedule.cron)) {
      console.warn(
        `[scheduler] invalid cron "${schedule.cron}" for ${schedule.id}, skip`
      );
      continue;
    }

    registerSchedule(schedule);
  }
}

export async function reloadSchedules(): Promise<void> {
  await reconcileSchedules("reload");
}

export function getActiveScheduleIds(): string[] {
  return Array.from(tasks.keys());
}

export function getSchedulerSnapshot() {
  return {
    runtimeRegisteredCount: tasks.size,
    runtimeRegisteredScheduleIds: getActiveScheduleIds(),
  };
}

function registerSchedule(schedule: typeof schedules.$inferSelect) {
  const task = cron.schedule(
    schedule.cron,
    async () => {
      console.log(`[scheduler] firing ${schedule.name} (${schedule.jobType})`);
      try {
        await runScheduleJob(schedule, "cron");
      } catch (err) {
        console.error(`[scheduler] job error for ${schedule.name}:`, err);
      }
    },
    { timezone: "America/New_York" }
  );

  tasks.set(schedule.id, {
    cron: schedule.cron,
    fingerprint: buildScheduleFingerprint(schedule),
    task,
  });
  console.log(
    `[scheduler] registered: ${schedule.name} @ ${schedule.cron} (${schedule.jobType})`
  );
}

function buildScheduleFingerprint(schedule: typeof schedules.$inferSelect) {
  return JSON.stringify({
    name: schedule.name,
    cron: schedule.cron,
    jobType: schedule.jobType,
    profileId: schedule.profileId,
    targetPlatformIds: schedule.targetPlatformIds ?? [],
    config: schedule.config ?? null,
    updatedAt: schedule.updatedAt?.toISOString?.() ?? String(schedule.updatedAt),
  });
}

async function ensureRecoveredAbandonedRuns() {
  if (didRecoverAbandonedRuns) {
    return;
  }

  await recoverAbandonedRuns();
  didRecoverAbandonedRuns = true;
}

async function recoverAbandonedRuns(): Promise<void> {
  const runningRuns = await db.select().from(pipelineRuns).where(eq(pipelineRuns.status, "running"));
  if (runningRuns.length === 0) return;

  console.warn(`[scheduler] recovering ${runningRuns.length} abandoned run(s)`);

  for (const run of runningRuns) {
    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        error: ABANDONED_RUN_ERROR,
        steps: finalizeAbandonedSteps(run.steps, ABANDONED_RUN_ERROR),
        completedAt: new Date(),
        durationMs: Math.max(0, Date.now() - new Date(run.startedAt).getTime()),
      })
      .where(eq(pipelineRuns.id, run.id));
  }
}
