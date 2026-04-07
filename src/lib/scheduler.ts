import cron from "node-cron";
import { db } from "@/db";
import { schedules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runAvatarVideoJob } from "./pipeline/runners/avatar-video";
import { runImagePostJob } from "./pipeline/runners/image-post";

const tasks = new Map<string, cron.ScheduledTask>();

export async function initScheduler(): Promise<void> {
  console.log("[scheduler] init");

  const rows = await db.select().from(schedules).where(eq(schedules.enabled, true));
  console.log(`[scheduler] ${rows.length} enabled schedules`);

  for (const sched of rows) {
    if (!cron.validate(sched.cron)) {
      console.warn(`[scheduler] invalid cron "${sched.cron}" for ${sched.id}, skip`);
      continue;
    }

    const task = cron.schedule(sched.cron, async () => {
      console.log(`[scheduler] firing ${sched.name} (${sched.jobType})`);
      try {
        if (sched.jobType === "avatar_video") {
          await runAvatarVideoJob(sched);
        } else if (sched.jobType === "image_post") {
          await runImagePostJob(sched);
        } else {
          console.error(`[scheduler] unknown jobType: ${sched.jobType}`);
        }
      } catch (err) {
        console.error(`[scheduler] job error for ${sched.name}:`, err);
      }
    }, { timezone: "America/New_York" });

    tasks.set(sched.id, task);
    console.log(`[scheduler] registered: ${sched.name} @ ${sched.cron} (${sched.jobType})`);
  }

  console.log("[scheduler] ready");
}

export async function reloadSchedules(): Promise<void> {
  console.log("[scheduler] reloading");
  for (const [id, task] of tasks) {
    task.stop();
  }
  tasks.clear();
  await initScheduler();
}

export function getActiveScheduleIds(): string[] {
  return Array.from(tasks.keys());
}
