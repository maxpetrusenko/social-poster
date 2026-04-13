import { db } from "@/db";
import { schedules } from "@/db/schema";
import { getSchedulerSnapshot } from "@/lib/scheduler";
import { eq } from "drizzle-orm";

export async function GET() {
  const enabledSchedules =
    (await db.select().from(schedules).where(eq(schedules.enabled, true))).length;
  const scheduler = getSchedulerSnapshot();

  return Response.json({
    status: "ok",
    app: "social-poster",
    time: new Date().toISOString(),
    schedules: {
      dbEnabledCount: enabledSchedules,
      runtimeRegisteredCount: scheduler.runtimeRegisteredCount,
      runtimeRegisteredScheduleIds: scheduler.runtimeRegisteredScheduleIds,
      drift:
        enabledSchedules === scheduler.runtimeRegisteredCount
          ? 0
          : enabledSchedules - scheduler.runtimeRegisteredCount,
    },
  });
}
