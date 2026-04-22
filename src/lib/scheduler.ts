import cron from "node-cron";
import { db } from "@/db";
import { pipelineRuns, schedules } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { processReadyReplyQueue } from "./replies/live";
import { runScheduleJob } from "./schedule-jobs";
import { finalizeAbandonedSteps } from "./pipeline/recovery";
import { getScheduleCronTimeZone } from "./timezone";
import {
  getTokenRefreshSnapshot,
  refreshExpiringPlatformTokens,
} from "./providers/token-refresh";
import {
  getProfileRefreshSnapshot,
  refreshPlatformProfiles,
} from "./providers/profile-refresh";
import {
  checkBirdSessions,
  getBirdSessionCheckSnapshot,
} from "./replies/bird-session-health";

type RegisteredScheduleTask = {
  cron: string;
  fingerprint: string;
  task: cron.ScheduledTask;
};

const tasks = new Map<string, RegisteredScheduleTask>();
const ABANDONED_RUN_ERROR = "Run interrupted by app restart before completion";
let didRecoverAbandonedRuns = false;
let readyQueueInterval: NodeJS.Timeout | null = null;
let tokenRefreshInterval: NodeJS.Timeout | null = null;
let tokenRefreshBootTimer: NodeJS.Timeout | null = null;
let profileRefreshInterval: NodeJS.Timeout | null = null;
let profileRefreshBootTimer: NodeJS.Timeout | null = null;
let birdSessionCheckInterval: NodeJS.Timeout | null = null;
let birdSessionCheckBootTimer: NodeJS.Timeout | null = null;
let dripQueueInterval: NodeJS.Timeout | null = null;
let blogAutomationInterval: NodeJS.Timeout | null = null;

export async function initScheduler(): Promise<void> {
  console.log("[scheduler] init");
  await ensureRecoveredAbandonedRuns();
  ensureReadyQueueWorker();
  ensureTokenRefreshWorker();
  ensureProfileRefreshWorker();
  ensureBirdSessionCheckWorker();
  ensureDripQueueWorker();
  ensureBlogAutomationWorker();
  await reconcileSchedules("init");

  console.log("[scheduler] ready");
}

export async function reconcileSchedules(reason = "manual"): Promise<void> {
  console.log(`[scheduler] reconciling (${reason})`);
  const rows = await db
    .select()
    .from(schedules)
    .where(and(eq(schedules.enabled, true), isNotNull(schedules.workspaceId)));
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

export async function ensureSchedulerReady(): Promise<void> {
  await ensureRecoveredAbandonedRuns();
  ensureReadyQueueWorker();
  ensureTokenRefreshWorker();
  ensureProfileRefreshWorker();
  ensureBirdSessionCheckWorker();
  ensureBlogAutomationWorker();

  if (tasks.size === 0) {
    await reconcileSchedules("ensure-ready");
  }
}

export function getActiveScheduleIds(): string[] {
  return Array.from(tasks.keys());
}

export function getSchedulerSnapshot() {
  return {
    runtimeRegisteredCount: tasks.size,
    runtimeRegisteredScheduleIds: getActiveScheduleIds(),
    tokenRefresh: getTokenRefreshSnapshot(),
    profileRefresh: getProfileRefreshSnapshot(),
    birdSessionCheck: getBirdSessionCheckSnapshot(),
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
    { timezone: getScheduleCronTimeZone() }
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

function ensureReadyQueueWorker() {
  if (readyQueueInterval) return;

  const runSweep = async () => {
    try {
      await processReadyReplyQueue();
    } catch (error) {
      console.error("[scheduler] ready queue sweep failed:", error);
    }
  };

  void runSweep();
  readyQueueInterval = setInterval(() => {
    void runSweep();
  }, 60_000);
  readyQueueInterval.unref?.();
}

function ensureTokenRefreshWorker() {
  if (tokenRefreshInterval || tokenRefreshBootTimer) return;

  const runSweep = async () => {
    try {
      const summary = await refreshExpiringPlatformTokens();
      if (summary.failed > 0 || summary.refreshed > 0) {
        console.log(
          `[scheduler] token refresh sweep: ${summary.refreshed} refreshed, ${summary.failed} failed, ${summary.skipped} skipped`
        );
      }
    } catch (error) {
      console.error("[scheduler] token refresh sweep failed:", error);
    }
  };

  tokenRefreshBootTimer = setTimeout(() => {
    tokenRefreshBootTimer = null;
    void runSweep();
  }, 10_000);
  tokenRefreshBootTimer.unref?.();

  tokenRefreshInterval = setInterval(() => {
    void runSweep();
  }, readTokenRefreshIntervalMs());
  tokenRefreshInterval.unref?.();
}

function ensureBirdSessionCheckWorker() {
  if (birdSessionCheckInterval || birdSessionCheckBootTimer) return;

  const runSweep = async () => {
    try {
      const summary = await checkBirdSessions();
      if (summary.checked > 0) {
        console.log(
          `[scheduler] Bird session check: ${summary.ok} ok, ${summary.failed} failed`
        );
      }
    } catch (error) {
      console.error("[scheduler] Bird session check failed:", error);
    }
  };

  birdSessionCheckBootTimer = setTimeout(() => {
    birdSessionCheckBootTimer = null;
    void runSweep();
  }, 30_000);
  birdSessionCheckBootTimer.unref?.();

  birdSessionCheckInterval = setInterval(() => {
    void runSweep();
  }, readBirdSessionCheckIntervalMs());
  birdSessionCheckInterval.unref?.();
}

function ensureProfileRefreshWorker() {
  if (profileRefreshInterval || profileRefreshBootTimer) return;

  const runSweep = async () => {
    try {
      const summary = await refreshPlatformProfiles();
      if (summary.failed > 0 || summary.avatarChanged > 0) {
        console.log(
          `[scheduler] profile refresh sweep: ${summary.refreshed} refreshed, ${summary.avatarChanged} avatar changed, ${summary.failed} failed`
        );
      }
    } catch (error) {
      console.error("[scheduler] profile refresh sweep failed:", error);
    }
  };

  profileRefreshBootTimer = setTimeout(() => {
    profileRefreshBootTimer = null;
    void runSweep();
  }, 20_000);
  profileRefreshBootTimer.unref?.();

  profileRefreshInterval = setInterval(() => {
    void runSweep();
  }, readProfileRefreshIntervalMs());
  profileRefreshInterval.unref?.();
}

function readTokenRefreshIntervalMs() {
  const hours = Number(process.env.TOKEN_REFRESH_SWEEP_HOURS ?? 6);
  return (Number.isFinite(hours) && hours > 0 ? hours : 6) * 60 * 60 * 1000;
}

function readBirdSessionCheckIntervalMs() {
  const hours = Number(process.env.BIRD_SESSION_CHECK_HOURS ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function readProfileRefreshIntervalMs() {
  const hours = Number(process.env.PROFILE_REFRESH_SWEEP_HOURS ?? 24);
  return (Number.isFinite(hours) && hours > 0 ? hours : 24) * 60 * 60 * 1000;
}

function ensureDripQueueWorker() {
  if (dripQueueInterval) return;

  const runSweep = async () => {
    try {
      const { processDripQueue } = await import("@/lib/marketing/drip");
      await processDripQueue();
    } catch (error) {
      console.error("[scheduler] drip queue sweep failed:", error);
    }
  };

  // First run after 30s boot delay
  const bootTimer = setTimeout(() => {
    void runSweep();
  }, 30_000);
  bootTimer.unref?.();

  // Then every 10 minutes
  dripQueueInterval = setInterval(() => {
    void runSweep();
  }, 10 * 60 * 1000);
  dripQueueInterval.unref?.();
}

function ensureBlogAutomationWorker() {
  if (blogAutomationInterval) return;

  const runSweep = async () => {
    try {
      const { runDailyBlogAutomation } = await import("@/lib/blog/daily");
      const result = await runDailyBlogAutomation();
      if (result.skipped === false) {
        console.log("[scheduler] daily blog draft generated");
      }
    } catch (error) {
      console.error("[scheduler] daily blog automation failed:", error);
    }
  };

  const bootTimer = setTimeout(() => {
    void runSweep();
  }, 45_000);
  bootTimer.unref?.();

  blogAutomationInterval = setInterval(() => {
    void runSweep();
  }, 60 * 60 * 1000);
  blogAutomationInterval.unref?.();
}
