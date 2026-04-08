import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHero, HeroButton, MetricCard, PlatformChip, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { ScheduleEnabledToggle } from "@/components/schedule-enabled-toggle";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { formatDate, relativeTime } from "@/lib/utils";
import { getPlatformMeta } from "@/lib/dashboard/platforms";

export default async function SchedulesPage() {
  const { scheduleInsights } = await getDashboardInsights();
  const activeCount = scheduleInsights.filter((schedule) => schedule.enabled).length;
  const failedCount = scheduleInsights.filter((schedule) => schedule.lastStatus === "failed").length;
  const nextRun = scheduleInsights
    .map((schedule) => schedule.nextRunAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Schedules"
        title="Automation cadence"
        description="What fires, where it posts, what broke last, and how consistent each loop is."
        actions={
          <>
            <HeroButton href="/dashboard/calendar" tone="ghost">Calendar</HeroButton>
            <HeroButton href="/dashboard/schedules/new">Add schedule</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Active" value={activeCount} sub={`${scheduleInsights.length} total schedules`} />
        <MetricCard
          label="Next fire"
          value={nextRun ? formatDate(nextRun) : "none"}
          sub={nextRun ? relativeTime(nextRun) : "no enabled schedule"}
          accent="var(--accent-mindfold)"
        />
        <MetricCard
          label="Needs attention"
          value={failedCount}
          sub="last run status = failed"
          accent={failedCount > 0 ? "#dc2626" : "var(--accent-spirit)"}
        />
      </div>

      <SectionCard
        title="All schedules"
        subtitle="Real success rate from pipeline runs. Toggle stays wired to cron reload."
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
                      shortLabel={meta.shortLabel}
                    />
                  );
                })}
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-5">
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Next</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {schedule.nextRunAt ? formatDate(schedule.nextRunAt) : "paused"}
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
    </div>
  );
}
