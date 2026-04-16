import { EditScheduleForm } from "@/components/edit-schedule-form";
import { db } from "@/db";
import { pipelineRuns, platforms, profiles, schedules } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getCronOccurrences } from "@/lib/dashboard/cron";
import { getPlatformLabel } from "@/lib/dashboard/platforms";
import {
  loadAgentPersonaScheduleContext,
  renderAgentPersonaScheduleContent,
} from "@/lib/pipeline/agent-persona-updates";
import { getCandidateStories } from "@/lib/pipeline/feed-engine";
import { writePostCaption } from "@/lib/pipeline/script-writer";
import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";
import { getWorkspaceRssSettings } from "@/lib/rss-config";
import {
  formatDateInZone,
  getAppTimeZone,
  getScheduleCronTimeZone,
} from "@/lib/timezone";
import { getTenantContext } from "@/lib/tenancy";

function normalizePlatformKey(value: string) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized === "x" ? "twitter" : normalized;
}

function positiveModulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function sourceLabel(link: string, sourceName?: string) {
  if (sourceName) return sourceName;

  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

function selectDashboardCandidate(
  schedule: typeof schedules.$inferSelect,
  candidatePool: Awaited<ReturnType<typeof getCandidateStories>>,
  runIndex: number
) {
  const needsImage = schedule.jobType === "image_post";
  const eligibleCandidates = candidatePool.filter((candidate) =>
    needsImage ? Boolean(candidate.imageUrl) : true
  );

  if (!eligibleCandidates.length) return null;
  return eligibleCandidates[positiveModulo(runIndex, eligibleCandidates.length)] ?? null;
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
    getScheduleCronTimeZone()
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
  const rssSettings = await getWorkspaceRssSettings(tenant.currentWorkspace.id);
  const agentPersonaContext = await loadAgentPersonaScheduleContext(schedule.config);
  const agentPersonaContent = agentPersonaContext
    ? await renderAgentPersonaScheduleContent(
        agentPersonaContext,
        targetPlatforms.map((platform) => platform.type),
        nextRunAt
      )
    : null;
  const fixedContent = resolveFixedScheduleContent(
    schedule.config,
    targetPlatforms.map((platform) => platform.type),
    normalizedRuns.length,
    nextRunAt
  );
  const previewContent = agentPersonaContent || fixedContent;
  const preview = previewContent
    ? {
        mode: agentPersonaContent ? ("agent-persona" as const) : ("fixed" as const),
        title: previewContent.title,
        summary: previewContent.summary,
        variantIndex: previewContent.variantIndex,
        sourceUrl: null,
        sourceLabel: null,
        sourceScore: null,
        platforms: targetPlatforms.map((platform) => {
          const key = normalizePlatformKey(platform.type);

          return {
            label: getPlatformLabel(platform.type),
            handle: platform.handle,
            content: previewContent.contentByPlatform[key] ?? null,
            mediaUrl: previewContent.mediaUrlByPlatform[key] ?? null,
            instagramContentType:
              previewContent.instagramContentTypeByPlatform[key] ?? null,
          };
        }),
      }
    : await (async () => {
        const candidatePool = await getCandidateStories({
          count: rssSettings.candidatePoolSize,
          maxAgeHours: rssSettings.candidateWindowHours,
          workspaceId: tenant.currentWorkspace.id,
        });
        const candidate = selectDashboardCandidate(
          schedule,
          candidatePool,
          normalizedRuns.length
        );

        if (!candidate) return null;

        const mediaUrl = candidate.imageUrl ?? null;

        return {
          mode: "feed" as const,
          title: candidate.title,
          summary: candidate.summary,
          variantIndex: normalizedRuns.length,
          sourceUrl: candidate.link,
          sourceLabel: sourceLabel(candidate.link, candidate.sourceName),
          sourceScore: candidate.score,
          platforms: targetPlatforms.map((platform) => ({
            label: getPlatformLabel(platform.type),
            handle: platform.handle,
            content: writePostCaption(candidate, platform.type, rssSettings),
            mediaUrl,
            instagramContentType: null,
          })),
        };
      })();

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
