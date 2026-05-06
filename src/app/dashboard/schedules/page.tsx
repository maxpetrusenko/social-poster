import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { DashboardHero, DashboardPageContent, HeroButton, MetricCard, PlatformChip, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { ScheduleEnabledToggle } from "@/components/schedule-enabled-toggle";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { relativeTime } from "@/lib/utils";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { formatDateInZone } from "@/lib/timezone";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SchedulesPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const { scheduleInsights: allScheduleInsights, runtimeScheduleCount, scheduleRuntimeDrift } =
    await getDashboardInsights(tenant.currentWorkspace.id);
  const scheduleInsights = allScheduleInsights.filter((s) => s.jobType !== "reply_engine");
  const activeCount = scheduleInsights.filter((schedule) => schedule.enabled).length;
  const failedCount = scheduleInsights.filter((schedule) => schedule.lastStatus === "failed").length;
  const nextRun = scheduleInsights
    .map((schedule) => schedule.nextRunAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return (
    <DashboardPageContent>
      <DashboardHero
        eyebrow="Schedules"
        title="Automation cadence"
        description="What fires. Where it posts. What broke."
        actions={
          <>
            <HeroButton href="/dashboard/calendar" tone="ghost">Calendar</HeroButton>
            <HeroButton href="/dashboard/schedules/new">Add schedule</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="Active"
          value={activeCount}
          sub={`${runtimeScheduleCount} runtime registered`}
        />
        <MetricCard
          label="Next fire"
          value={nextRun ? formatDateInZone(nextRun) : "none"}
          sub={nextRun ? relativeTime(nextRun) : "no enabled schedule"}
          accent="var(--accent-mindfold)"
        />
        <MetricCard
          label="Needs attention"
          value={scheduleRuntimeDrift !== 0 ? Math.abs(scheduleRuntimeDrift) : failedCount}
          sub={
            scheduleRuntimeDrift !== 0
              ? "scheduler drift detected"
              : "last run status = failed"
          }
          accent={
            scheduleRuntimeDrift !== 0 || failedCount > 0
              ? "#dc2626"
              : "var(--accent-spirit)"
          }
        />
      </div>

      {scheduleRuntimeDrift !== 0 ? (
        <div className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          DB enabled schedules and runtime registrations differ. Check `/api/health`
          before trusting pause/resume state.
        </div>
      ) : null}

      <SectionCard
        title="All schedules"
        subtitle="Real success rate."
        action={
          <Link
            href="/dashboard/schedules/new"
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--sand)]"
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        }
      >
        <div className="space-y-4">
          {scheduleInsights.map((schedule) => (
            <div
              key={schedule.id}
              className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Link href={`/dashboard/schedules/${schedule.id}`} className="font-serif text-[1.4rem] text-[var(--ink)]">
                      {schedule.name}
                    </Link>
                    <StatusBadge tone={schedule.lastStatus === "failed" ? "bad" : schedule.enabled ? "good" : "neutral"}>
                      {schedule.enabled ? "enabled" : "disabled"}
                    </StatusBadge>
                    <StatusBadge tone="neutral">{schedule.jobType.replace(/_/g, " ")}</StatusBadge>
                    {schedule.contentCategoryLabel ? (
                      <StatusBadge tone="neutral">{schedule.contentCategoryLabel}</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">
                    {schedule.cronHuman || schedule.cron}
                  </p>
                </div>

                <ScheduleEnabledToggle id={schedule.id} enabled={schedule.enabled} />
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {schedule.targetPlatforms.map((platform) => {
                  const meta = getPlatformMeta(platform);
                  return (
                    <PlatformChip
                      key={`${schedule.id}-${platform}`}
                      label={platform}
                      accent={meta.accent}
                      type={platform}
                    />
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-5">
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Next</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {schedule.nextRunAt ? formatDateInZone(schedule.nextRunAt) : "paused"}
                  </p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Success</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{schedule.successRate}%</p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Runs</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{schedule.totalRuns}</p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Avg</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{schedule.avgDurationSeconds}s</p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Last</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {schedule.lastRunAt ? relativeTime(schedule.lastRunAt) : "never"}
                  </p>
                </div>
              </div>

              {schedule.lastError ? (
                <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {schedule.lastError}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>
    </DashboardPageContent>
  );
}
