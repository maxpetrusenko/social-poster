import { EditScheduleForm } from "@/components/edit-schedule-form";
import { db } from "@/db";
import { pipelineRuns, platforms, profiles, schedules } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [schedule, profileRows, platformRows, runRows] = await Promise.all([
    db.query.schedules.findFirst({ where: eq(schedules.id, id) }),
    db.select({ id: profiles.id, name: profiles.name }).from(profiles),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        handle: platforms.handle,
      })
      .from(platforms),
    db
      .select({
        id: pipelineRuns.id,
        status: pipelineRuns.status,
        trigger: pipelineRuns.trigger,
        startedAt: pipelineRuns.startedAt,
        error: pipelineRuns.error,
      })
      .from(pipelineRuns)
      .where(eq(pipelineRuns.scheduleId, id))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(20),
  ]);

  if (!schedule) {
    notFound();
  }

  const normalizedRuns = runRows.map((run) => ({
    ...run,
    status: resolvePipelineRunStatus(run),
  }));

  return (
    <EditScheduleForm
      schedule={{
        ...schedule,
        targetPlatformIds: schedule.targetPlatformIds ?? [],
        config: schedule.config ?? null,
      }}
      profiles={profileRows}
      platforms={platformRows}
      runs={normalizedRuns}
    />
  );
}
