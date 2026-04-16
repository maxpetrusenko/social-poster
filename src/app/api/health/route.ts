import { db, checkIntegrity, checkCoreTables, sqlite } from "@/db";
import { schedules } from "@/db/schema";
import { ensureSchedulerReady, getSchedulerSnapshot } from "@/lib/scheduler";
import { eq } from "drizzle-orm";

export async function GET() {
  await ensureSchedulerReady();
  const enabledSchedules =
    (await db.select().from(schedules).where(eq(schedules.enabled, true))).length;
  const scheduler = getSchedulerSnapshot();

  const integrity = checkIntegrity(sqlite);
  const tables = checkCoreTables(sqlite);
  const dbHealthy = integrity.ok && tables.ok;

  return Response.json({
    status: dbHealthy ? "ok" : "degraded",
    app: "social-poster",
    time: new Date().toISOString(),
    database: {
      integrity: integrity.ok ? "ok" : "corrupted",
      errors: integrity.errors.slice(0, 5),
      tables: tables.ok ? "ok" : "missing",
      missingTables: tables.missing,
    },
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
