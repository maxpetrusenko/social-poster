import Link from "next/link";
import { desc } from "drizzle-orm";
import { DashboardHero, HeroButton, MetricCard, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { db } from "@/db";
import { replyEvents } from "@/db/schema";
import { relativeTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RepliesPage() {
  const rows = await db.select().from(replyEvents).orderBy(desc(replyEvents.createdAt)).limit(50);
  const sentCount = rows.filter((row) => row.status === "sent").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;
  const uniqueAuthors = new Set(rows.map((row) => row.authorHandle).filter((value) => value && value !== "n/a")).size;

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Replies"
        title="X reply engine"
        description="Discovery, sends, and misses from the app worker."
        actions={
          <>
            <HeroButton href="/dashboard/schedules">Schedules</HeroButton>
            <HeroButton href="/dashboard/pipeline" tone="ghost">Pipeline</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Sent" value={sentCount} sub="latest 50 events" />
        <MetricCard label="Failed" value={failedCount} sub="needs debug" accent={failedCount > 0 ? "#dc2626" : "var(--accent-spirit)"} />
        <MetricCard label="Authors" value={uniqueAuthors} sub="unique handles reached" accent="var(--accent-mindfold)" />
      </div>

      <SectionCard title="Reply log" subtitle="Newest first.">
        <div className="space-y-3">
          {rows.length === 0 ? (
            <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-6 text-sm text-[var(--muted)]">
              No reply events yet.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--ink)]">@{row.authorHandle}</p>
                      <StatusBadge tone={row.status === "sent" ? "good" : row.status === "failed" ? "bad" : "neutral"}>
                        {row.status}
                      </StatusBadge>
                      <StatusBadge tone={row.lane === "auto_draft" ? "good" : "warn"}>{row.lane}</StatusBadge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--muted)]">{row.replyText || row.error || "No reply text"}</p>
                    <p className="mt-2 text-xs text-[var(--muted)]">{row.tweetUrl}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {row.replyUrl ? (
                      <Link href={row.replyUrl} className="text-sm font-semibold text-[var(--accent-tech)]">
                        Open
                      </Link>
                    ) : null}
                    <p className="text-xs text-[var(--muted)]">{relativeTime(row.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>
    </div>
  );
}
