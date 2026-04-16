import { redirect } from "next/navigation";
import { RssManager } from "@/components/dashboard/rss-manager";
import {
  getCandidateStories,
  getFeedSourceDiagnostics,
} from "@/lib/pipeline/feed-engine";
import {
  getFeedDrivenSchedules,
  getUpcomingScheduleLabels,
  getWorkspaceRssSettings,
  getWorkspaceRssSources,
} from "@/lib/rss-config";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

function sourceLabel(link: string, sourceName?: string) {
  if (sourceName) return sourceName;

  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return link;
  }
}

export default async function RssPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const workspaceId = tenant.currentWorkspace.id;
  const [sources, settings, candidates, feedSchedules, diagnostics] = await Promise.all([
    getWorkspaceRssSources(workspaceId),
    getWorkspaceRssSettings(workspaceId),
    getCandidateStories({
      count: 8,
      maxAgeHours: 168,
      workspaceId,
    }),
    getFeedDrivenSchedules(workspaceId),
    getFeedSourceDiagnostics({ workspaceId }),
  ]);

  return (
    <RssManager
      initialSources={sources.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        weight: source.weight,
        enabled: source.enabled,
      }))}
      initialSettings={settings}
      initialCandidates={candidates.map((candidate) => ({
        title: candidate.title,
        link: candidate.link,
        summary: candidate.summary,
        score: candidate.score,
        tractionScore: candidate.tractionScore ?? 0,
        sourceLabel: sourceLabel(candidate.link, candidate.sourceName),
      }))}
      initialDiagnostics={diagnostics}
      feedSchedules={feedSchedules.map((schedule) => ({
        id: schedule.id,
        name: schedule.name,
        jobType: schedule.jobType,
        cronLabel: schedule.cronHuman || schedule.cron,
        nextRuns: getUpcomingScheduleLabels(schedule, 3),
      }))}
    />
  );
}
