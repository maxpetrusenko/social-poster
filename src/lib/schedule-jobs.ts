import { schedules } from "@/db/schema";
import { runAvatarVideoJob } from "@/lib/pipeline/runners/avatar-video";
import { runImagePostJob } from "@/lib/pipeline/runners/image-post";
import { runReplyEngineJob } from "@/lib/pipeline/runners/reply-engine";

type ScheduleRow = typeof schedules.$inferSelect;
type TriggerKind = "cron" | "manual" | "api";

export async function runScheduleJob(
  schedule: ScheduleRow,
  trigger: TriggerKind = "cron"
): Promise<void> {
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
