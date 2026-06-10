import { db, checkIntegrity, checkCoreTables, sqlite } from "@/db";
import { pipelineRuns, posts, schedules } from "@/db/schema";
import { ensureSchedulerReady, getSchedulerSnapshot } from "@/lib/scheduler";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

export async function GET() {
  await ensureSchedulerReady();
  const enabledSchedules =
    (
      await db
        .select()
        .from(schedules)
        .where(and(eq(schedules.enabled, true), isNotNull(schedules.workspaceId)))
    ).length;
  const scheduler = getSchedulerSnapshot();
  const [latestXLikedRun] = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      error: pipelineRuns.error,
      postId: pipelineRuns.postId,
    })
    .from(pipelineRuns)
    .where(sql`${pipelineRuns.steps} like '%x-like:%'`)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);
  const [xLikedQueueSummary] = await db
    .select({
      totalCount: sql<number>`count(*)`,
      scheduledCount: sql<number>`sum(case when ${posts.status} = 'scheduled' then 1 else 0 end)`,
      nextScheduledAt: sql<string | null>`min(case when ${posts.status} = 'scheduled' then ${posts.scheduledAt} else null end)`,
    })
    .from(posts)
    .where(sql`${posts.dedupKey} like 'x-like:%'`);

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
    tokenRefresh: scheduler.tokenRefresh,
    xLikedAutopost: {
      ...scheduler.xLikedAutopost,
      latestRun: latestXLikedRun
        ? {
            id: latestXLikedRun.id,
            status: latestXLikedRun.status,
            startedAt: latestXLikedRun.startedAt,
            completedAt: latestXLikedRun.completedAt,
            error: latestXLikedRun.error,
            postId: latestXLikedRun.postId,
          }
        : null,
      queue: {
        totalCount: xLikedQueueSummary?.totalCount ?? 0,
        scheduledCount: xLikedQueueSummary?.scheduledCount ?? 0,
        nextScheduledAt: xLikedQueueSummary?.nextScheduledAt ?? null,
      },
    },
  });
}
