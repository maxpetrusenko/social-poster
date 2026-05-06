import Link from "next/link";
import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import { DashboardHero, DashboardPageContent, HeroButton, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { getCalendarInsights, getDashboardInsights } from "@/lib/dashboard/insights";
import { getDashboardWorkspaceScope } from "@/lib/dashboard/workspace-scope";
import { formatDate } from "@/lib/utils";
import { formatTimeInZone } from "@/lib/timezone";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

function getCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: Array<Date | null> = [];
  for (let index = 0; index < startingDayOfWeek; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) days.push(new Date(year, monthIndex, day));
  return days;
}

function toneClass(tone: "planned" | "completed" | "failed" | "running") {
  if (tone === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "failed") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "running") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

const listTabs = [
  { id: "queue", label: "Queue" },
  { id: "drafts", label: "Drafts" },
  { id: "sent", label: "Sent" },
] as const;

async function loadTabPosts(tab: (typeof listTabs)[number]["id"], postIds: string[]) {
  if (postIds.length === 0) {
    return [];
  }

  if (tab === "queue") {
    return db
      .select()
      .from(posts)
      .where(and(inArray(posts.id, postIds), inArray(posts.status, ["scheduled", "publishing"])))
      .orderBy(desc(posts.updatedAt));
  }

  if (tab === "drafts") {
    return db
      .select()
      .from(posts)
      .where(and(inArray(posts.id, postIds), eq(posts.status, "draft")))
      .orderBy(desc(posts.updatedAt));
  }

  if (tab === "sent") {
    return db
      .select()
      .from(posts)
      .where(
        and(
          inArray(posts.id, postIds),
          inArray(posts.status, ["published", "partial_failure", "failed"])
        )
      )
      .orderBy(desc(posts.updatedAt));
  }

  return [];
}

export default async function PublishPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const params = searchParams ? await searchParams : {};
  const mode = params.mode === "list" ? "list" : "calendar";
  const tab = listTabs.some((item) => item.id === params.tab)
    ? (params.tab as (typeof listTabs)[number]["id"])
    : "queue";

  const monthParam = params.month || new Date().toISOString().slice(0, 7);
  const workspaceScope = await getDashboardWorkspaceScope(tenant.currentWorkspace.id);
  const [dashboard, calendar, queueCount, draftCount, sentCount, tabPosts] =
    await Promise.all([
      getDashboardInsights(tenant.currentWorkspace.id),
      getCalendarInsights(monthParam, tenant.currentWorkspace.id),
      workspaceScope.postIds.length > 0
        ? db
            .select({ id: posts.id })
            .from(posts)
            .where(
              and(
                inArray(posts.id, workspaceScope.postIds),
                inArray(posts.status, ["scheduled", "publishing"])
              )
            )
        : Promise.resolve([] as Array<{ id: string }>),
      workspaceScope.postIds.length > 0
        ? db
            .select({ id: posts.id })
            .from(posts)
            .where(and(inArray(posts.id, workspaceScope.postIds), eq(posts.status, "draft")))
        : Promise.resolve([] as Array<{ id: string }>),
      workspaceScope.postIds.length > 0
        ? db
            .select({ id: posts.id })
            .from(posts)
            .where(
              and(
                inArray(posts.id, workspaceScope.postIds),
                inArray(posts.status, ["published", "partial_failure", "failed"])
              )
            )
        : Promise.resolve([] as Array<{ id: string }>),
      loadTabPosts(tab, workspaceScope.postIds),
    ]);

  const [yearStr, monthStr] = monthParam.split("-");
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const days = getCalendarDays(year, monthIndex);
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const upcomingSchedules = dashboard.scheduleInsights.slice(0, 4);

  const postTargetCounts = new Map<string, number>();
  if (tabPosts.length > 0) {
    const targetRows = await db
      .select({ postId: postTargets.postId })
      .from(postTargets)
      .where(
        and(
          inArray(postTargets.postId, tabPosts.map((post) => post.id)),
          inArray(postTargets.platformId, workspaceScope.platformIds)
        )
      );
    targetRows.forEach((target) => {
      postTargetCounts.set(target.postId, (postTargetCounts.get(target.postId) ?? 0) + 1);
    });
  }

  return (
    <DashboardPageContent>
      <DashboardHero
        eyebrow="Publish"
        title="Calendar, queue, approvals, sent"
        description="Primary operations shell. Existing calendar, posts, and pipeline truth now meet in one route."
        actions={
          <>
            <HeroButton href="/dashboard/posts">All Posts</HeroButton>
            <HeroButton href="/dashboard/posts/create">Create Post</HeroButton>
          </>
        }
      />

      <SectionCard
        title="Modes"
        subtitle="Switch between calendar planning and list operations."
        action={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/publish?mode=calendar"
              className={`rounded-[12px] border px-4 py-2 text-sm font-semibold ${
                mode === "calendar"
                  ? "border-[rgba(15,126,169,0.18)] bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                  : "border-[var(--line)] bg-white text-[var(--ink)]"
              }`}
            >
              Calendar
            </Link>
            <Link
              href={`/dashboard/publish?mode=list&tab=${tab}`}
              className={`rounded-[12px] border px-4 py-2 text-sm font-semibold ${
                mode === "list"
                  ? "border-[rgba(15,126,169,0.18)] bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                  : "border-[var(--line)] bg-white text-[var(--ink)]"
              }`}
            >
              List
            </Link>
          </div>
        }
      >
        {mode === "calendar" ? (
          <div className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="overflow-hidden rounded-[20px] border border-[rgba(12,17,21,0.08)]">
                <div className="grid grid-cols-7 border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.04)]">
                  {labels.map((label) => (
                    <div
                      key={label}
                      className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--muted)]"
                    >
                      {label}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7">
                  {days.map((day, index) => {
                    if (!day) {
                      return (
                        <div
                          key={`empty-${index}`}
                          className="min-h-32 border-r border-b border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)]"
                        />
                      );
                    }

                    const key = day.toISOString().slice(0, 10);
                    const events = calendar.eventsByDay[key] || [];

                    return (
                      <div
                        key={key}
                        className="min-h-32 border-r border-b border-[rgba(12,17,21,0.08)] bg-white/82 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-[var(--ink)]">{day.getDate()}</span>
                          {events.length > 0 ? (
                            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                              {events.length}
                            </span>
                          ) : null}
                        </div>
                        <div className="space-y-1.5">
                          {events.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className={`rounded-[10px] border px-2 py-1.5 text-[11px] font-medium ${toneClass(
                                event.tone
                              )}`}
                              title={event.label}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate">{event.label}</span>
                                <span className="shrink-0 opacity-70">
                                  {formatTimeInZone(event.at)}
                                </span>
                              </div>
                            </div>
                          ))}
                          {events.length > 3 ? (
                            <div className="px-1 text-[11px] font-semibold text-[var(--muted)]">
                              +{events.length - 3} more
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4">
                  <p className="section-eyebrow text-[var(--muted)]">Upcoming</p>
                  <div className="mt-3 space-y-3">
                    {upcomingSchedules.length === 0 ? (
                      <p className="text-sm text-[var(--muted)]">No schedules yet.</p>
                    ) : (
                      upcomingSchedules.map((schedule) => (
                        <Link
                          key={schedule.id}
                          href={`/dashboard/schedules/${schedule.id}`}
                          className="block rounded-[14px] border border-[rgba(12,17,21,0.08)] bg-white px-3 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--ink)]">{schedule.name}</p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {schedule.nextRunAt ? formatDate(schedule.nextRunAt) : "paused"}
                              </p>
                            </div>
                            <StatusBadge tone={schedule.enabled ? "good" : "neutral"}>
                              {schedule.enabled ? "live" : "off"}
                            </StatusBadge>
                          </div>
                        </Link>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4">
                  <p className="section-eyebrow text-[var(--muted)]">Fast links</p>
                  <div className="mt-3 flex flex-col gap-2">
                    <Link href="/dashboard/calendar" className="text-sm font-semibold text-[var(--accent-tech)]">
                      Full calendar
                    </Link>
                    <Link href="/dashboard/schedules" className="text-sm font-semibold text-[var(--accent-tech)]">
                      Schedule control
                    </Link>
                    <Link href="/dashboard/pipeline" className="text-sm font-semibold text-[var(--accent-tech)]">
                      Pipeline truth
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {listTabs.map((item) => {
                const counts = {
                  queue: queueCount.length,
                  drafts: draftCount.length,
                  sent: sentCount.length,
                } as const;

                return (
                  <Link
                    key={item.id}
                    href={`/dashboard/publish?mode=list&tab=${item.id}`}
                    className={`rounded-[12px] border px-4 py-2 text-sm font-semibold ${
                      tab === item.id
                        ? "border-[rgba(15,126,169,0.18)] bg-[rgba(15,126,169,0.10)] text-[var(--accent-tech)]"
                        : "border-[var(--line)] bg-white text-[var(--ink)]"
                    }`}
                  >
                    {item.label} ({counts[item.id]})
                  </Link>
                );
              })}
            </div>

            {tabPosts.length === 0 ? (
              <div className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-5 py-8 text-sm text-[var(--muted)]">
                No posts in this list state yet.
              </div>
            ) : (
              <div className="space-y-3">
                {tabPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/dashboard/posts/${post.id}`}
                    className="block rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-4 transition hover:border-[rgba(15,126,169,0.18)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-lg font-semibold text-[var(--ink)]">
                            {post.title || "Untitled Post"}
                          </p>
                          <StatusBadge
                            tone={
                              post.status === "published"
                                ? "good"
                                : post.status === "failed" || post.status === "partial_failure"
                                  ? "bad"
                                  : post.status === "draft"
                                    ? "neutral"
                                    : "warn"
                            }
                          >
                            {post.status.replace(/_/g, " ")}
                          </StatusBadge>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--muted)]">
                          {post.content}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                          <span>{post.contentType}</span>
                          <span>{postTargetCounts.get(post.id) ?? 0} targets</span>
                          <span>
                            {post.scheduledAt
                              ? `Scheduled ${formatDate(post.scheduledAt)}`
                              : `Updated ${formatDate(post.updatedAt)}`}
                          </span>
                        </div>
                      </div>
                      <ArrowRightBadge />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>
    </DashboardPageContent>
  );
}

function ArrowRightBadge() {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(12,17,21,0.08)] bg-white text-[var(--accent-tech)]">
      →
    </span>
  );
}
