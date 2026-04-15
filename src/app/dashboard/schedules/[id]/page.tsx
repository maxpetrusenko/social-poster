import { EditScheduleForm } from "@/components/edit-schedule-form";
import { db } from "@/db";
import { pipelineRuns, platforms, profiles, schedules } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getCronOccurrences } from "@/lib/dashboard/cron";
import { getPlatformLabel } from "@/lib/dashboard/platforms";
import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";
import { formatDateInZone, getAppTimeZone } from "@/lib/timezone";
import { getTenantContext } from "@/lib/tenancy";

function normalizePlatformKey(value: string) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "x" ? "twitter" : normalized;
}

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const [schedule, profileRows, platformRows, runRows] = await Promise.all([
    db.query.schedules.findFirst({
      where: and(eq(schedules.id, id), eq(schedules.workspaceId, tenant.currentWorkspace.id)),
    }),
    db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.workspaceId, tenant.currentWorkspace.id)),
    db
      .select({
        id: platforms.id,
        name: platforms.name,
        type: platforms.type,
        handle: platforms.handle,
      })
      .from(platforms)
      .where(eq(platforms.workspaceId, tenant.currentWorkspace.id)),
    db
      .select({
        id: pipelineRuns.id,
        status: pipelineRuns.status,
        trigger: pipelineRuns.trigger,
        startedAt: pipelineRuns.startedAt,
        error: pipelineRuns.error,
      })
      .from(pipelineRuns)
      .where(
        and(
          eq(pipelineRuns.scheduleId, id),
          eq(pipelineRuns.workspaceId, tenant.currentWorkspace.id)
        )
      )
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

  const targetPlatforms = (schedule.targetPlatformIds ?? [])
    .map((platformId) => platformRows.find((platform) => platform.id === platformId))
    .filter(
      (
        platform
      ): platform is {
        id: string;
        name: string;
        type: string;
        handle: string | null;
      } => Boolean(platform)
    );

  const end = new Date();
  end.setDate(end.getDate() + 120);
  const nextRuns = getCronOccurrences(
    schedule.cron,
    new Date(),
    end,
    3,
    getAppTimeZone()
  );
  const nextRunLabels = nextRuns.map((date) =>
    formatDateInZone(
      date,
      {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      },
      getAppTimeZone()
    )
  );

  const nextRunAt = nextRuns[0] ?? new Date();
  const fixedContent = resolveFixedScheduleContent(
    schedule.config,
    targetPlatforms.map((platform) => platform.type),
    normalizedRuns.length,
    nextRunAt
  );
  const preview = fixedContent
    ? {
        title: fixedContent.title,
        summary: fixedContent.summary,
        variantIndex: fixedContent.variantIndex,
        platforms: targetPlatforms.map((platform) => {
          const key = normalizePlatformKey(platform.type);

          return {
            label: getPlatformLabel(platform.type),
            handle: platform.handle,
            content: fixedContent.contentByPlatform[key] ?? null,
            mediaUrl: fixedContent.mediaUrlByPlatform[key] ?? null,
            instagramContentType:
              fixedContent.instagramContentTypeByPlatform[key] ?? null,
          };
        }),
      }
    : null;

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
      nextRunLabels={nextRunLabels}
      preview={preview}
    />
  );
}
