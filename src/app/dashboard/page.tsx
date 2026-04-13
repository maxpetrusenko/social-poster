import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, MessageSquareReply, Sparkles } from "lucide-react";
import { DashboardHero, HeroButton, MetricCard, PlatformChip, SectionCard, StatusBadge, TinyBars } from "@/components/dashboard/ui";
import { ManualCandidateCard } from "@/components/dashboard/manual-candidate-card";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { relativeTime } from "@/lib/utils";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { getDashboardCandidates } from "@/lib/dashboard/candidates";
import { formatDateInZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardInsights();
  const candidates = await getDashboardCandidates(4);

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Live dashboard"
        title="Automated social posting"
        description="Cadence, failures, connected platforms, upcoming slots."
        actions={
          <>
            <HeroButton href="/dashboard/pipeline">View runs</HeroButton>
            <HeroButton href="/dashboard/calendar" tone="ghost">Open calendar</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Pieces, 30d"
          value={data.publishedPieces30d}
          sub={data.lastPublishedAt ? `last hit ${relativeTime(data.lastPublishedAt)}` : "no successful run yet"}
          accent="var(--accent-tech)"
        />
        <MetricCard
          label="Platform deliveries"
          value={data.deliveryCount30d}
          sub={`${data.replyCount30d} replies sent in 30d`}
          accent="var(--accent-spirit)"
        />
        <MetricCard
          label="Consistency, 30d"
          value={`${data.consistencyScore30d}%`}
          sub={`${data.activeScheduleCount} DB live / ${data.runtimeScheduleCount} runtime`}
          accent="var(--accent-mindfold)"
        />
        <MetricCard
          label="Failures, 30d"
          value={data.failureCount30d}
          sub={`${data.completionRate30d}% run completion`}
          accent={data.failureCount30d > 0 ? "#dc2626" : "var(--accent-spirit)"}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <SectionCard
          title="Posting rhythm"
          subtitle={`14-day view. Streak: ${data.streakDays} day${data.streakDays === 1 ? "" : "s"}.`}
        >
          <TinyBars
            items={data.timeseries.map((item) => ({
              label: new Date(`${item.date}T12:00:00`).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              }),
              value: item.pieces,
              accent: item.failures > 0 ? "var(--accent-mindfold)" : "var(--accent-tech)",
            }))}
          />
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3">
              <p className="section-eyebrow text-[var(--muted)]">Healthy days</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {data.timeseries.filter((item) => item.pieces > 0 && item.failures === 0).length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3">
              <p className="section-eyebrow text-[var(--muted)]">Error days</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {data.timeseries.filter((item) => item.failures > 0).length}
              </p>
            </div>
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3">
              <p className="section-eyebrow text-[var(--muted)]">Best day</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                {Math.max(...data.timeseries.map((item) => item.deliveries), 0)}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Platform health"
          subtitle="30-day delivery stats."
          action={<Link href="/dashboard/platforms" className="text-sm font-semibold text-[var(--accent-tech)]">All platforms</Link>}
        >
          <div className="space-y-3">
            {data.platformInsights.map((platform) => (
              <div
                key={platform.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <PlatformChip
                    label={platform.name}
                    accent={platform.accent}
                    shortLabel={platform.shortLabel}
                  />
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {platform.handle || "connected"}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {platform.scheduleCount} schedule{platform.scheduleCount === 1 ? "" : "s"} attached
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={platform.failureCount30d > 0 ? "warn" : "good"}>
                    {platform.deliveryCount30d} delivered
                  </StatusBadge>
                  <StatusBadge tone={platform.failureCount30d > 0 ? "bad" : "neutral"}>
                    {platform.failureCount30d} errors
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_1.25fr]">
        <SectionCard
          title="Schedule cadence"
          subtitle="Next fire. Health. Targets."
          action={<Link href="/dashboard/schedules" className="text-sm font-semibold text-[var(--accent-tech)]">Manage schedules</Link>}
        >
          <div className="space-y-3">
            {data.scheduleInsights.map((schedule) => (
              <Link
                key={schedule.id}
                href={`/dashboard/schedules/${schedule.id}`}
                className="block rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-4 transition hover:-translate-y-0.5 hover:border-[rgba(15,126,169,0.18)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-[var(--ink)]">{schedule.name}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {schedule.cronHuman || schedule.cron}
                    </p>
                  </div>
                  <StatusBadge tone={schedule.lastStatus === "failed" ? "bad" : schedule.enabled ? "good" : "neutral"}>
                    {schedule.enabled ? "live" : "off"}
                  </StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
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
                <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                    <p className="section-eyebrow text-[var(--muted)]">Avg runtime</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{schedule.avgDurationSeconds}s</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent activity"
          subtitle="Latest runs."
          action={<Link href="/dashboard/pipeline" className="text-sm font-semibold text-[var(--accent-tech)]">Open pipeline</Link>}
        >
          <div className="space-y-3">
            {data.recentRuns.map((run) => (
              <div
                key={run.id}
                className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {run.status === "completed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : run.status === "failed" ? (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      ) : (
                        <CalendarClock className="h-4 w-4 text-amber-600" />
                      )}
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">
                        {run.scheduleName || "Manual run"}
                      </p>
                    </div>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      {relativeTime(run.startedAt)} · {run.durationMs ? `${Math.round(run.durationMs / 1000)}s` : "running"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={run.status === "completed" ? "good" : run.status === "failed" ? "bad" : "warn"}>
                      {run.status}
                    </StatusBadge>
                    {run.publish.publishedPlatforms.length > 0 ? (
                      <StatusBadge tone="good">{run.publish.publishedPlatforms.length} hits</StatusBadge>
                    ) : null}
                  </div>
                </div>
                {run.publish.publishedPlatforms.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {run.publish.publishedPlatforms.map((platform) => {
                      const meta = getPlatformMeta(platform);
                      return (
                        <PlatformChip
                          key={`${run.id}-${platform}`}
                          label={meta.label}
                          accent={meta.accent}
                          shortLabel={meta.shortLabel}
                        />
                      );
                    })}
                  </div>
                ) : null}
                {run.error ? (
                  <p className="mt-3 text-sm text-red-700">{run.error}</p>
                ) : null}
              </div>
            ))}

            {data.recentPosts.length > 0 ? (
              <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(15,126,169,0.05)] px-4 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[var(--accent-tech)]" />
                  <p className="text-sm font-semibold text-[var(--ink)]">Manual post records</p>
                </div>
                <div className="mt-3 space-y-2">
                  {data.recentPosts.slice(0, 3).map((post) => (
                    <Link key={post.id} href={`/dashboard/posts/${post.id}`} className="flex items-center justify-between gap-3 text-sm text-[var(--ink)]">
                      <span className="truncate">{post.title || post.content.slice(0, 72)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[var(--accent-tech)]" />
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      </div>

      {data.scheduleRuntimeDrift !== 0 ? (
        <SectionCard
          title="Runtime drift"
          subtitle="DB schedule state and in-memory scheduler do not agree."
        >
          <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
            DB enabled: {data.activeScheduleCount}. Runtime registered: {data.runtimeScheduleCount}.
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Reply engine"
        subtitle="Latest X replies sent from the app."
        action={<Link href="/dashboard/replies" className="text-sm font-semibold text-[var(--accent-tech)]">Open replies</Link>}
      >
        <div className="space-y-3">
          {data.recentReplies.length === 0 ? (
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--muted)]">
              No reply history yet.
            </div>
          ) : (
            data.recentReplies.slice(0, 5).map((reply) => (
              <div
                key={reply.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MessageSquareReply className="h-4 w-4 text-[var(--accent-tech)]" />
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">@{reply.authorHandle}</p>
                    <StatusBadge tone={reply.status === "sent" ? "good" : reply.status === "failed" ? "bad" : "neutral"}>
                      {reply.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{reply.replyText || reply.error || "No reply text"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {reply.replyUrl ? (
                    <Link href={reply.replyUrl} className="text-sm font-semibold text-[var(--accent-tech)]">
                      Open
                    </Link>
                  ) : null}
                  <p className="text-xs text-[var(--muted)]">{relativeTime(reply.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Manual candidates"
        subtitle="Recent feed picks with OG image when available."
        action={<Link href="/dashboard/posts/new" className="text-sm font-semibold text-[var(--accent-tech)]">Create post</Link>}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {candidates.map((candidate) => {
            const href = `/dashboard/posts/new?${new URLSearchParams({
              title: candidate.title,
              content: candidate.title,
              contentType: candidate.ogImageUrl ? "image" : "text",
              sourceUrl: candidate.link,
              ...(candidate.ogImageUrl ? { mediaUrl: candidate.ogImageUrl } : {}),
            }).toString()}`;

            return (
              <ManualCandidateCard
                key={candidate.link}
                candidate={candidate}
                href={href}
                showSummary={false}
              />
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
