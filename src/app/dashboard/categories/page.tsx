import Link from "next/link";
import { ArrowUpRight, CalendarClock, Plus, Tags } from "lucide-react";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { POST_CATEGORIES } from "@/lib/post-categories";
import { formatDateInZone } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const CATEGORY_ACCENTS: Record<string, string> = {
  opinion_take: "#0f7ea9",
  product_update: "#1f9d61",
  source_share: "#d2a35d",
  hype_future: "#ea6f66",
  hiring_signal: "#6d5bd0",
};

export default async function CategoriesPage() {
  const { scheduleInsights } = await getDashboardInsights();

  const rows = POST_CATEGORIES.map((category) => {
    const schedules = scheduleInsights.filter(
      (schedule) => schedule.contentCategory === category.value
    );

    return {
      ...category,
      schedules,
      total: schedules.length,
      enabled: schedules.filter((schedule) => schedule.enabled).length,
    };
  });

  return (
    <div className="space-y-6">
      <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white/92 p-6 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(12,17,21,0.05)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--muted)]">
              <Tags className="h-3.5 w-3.5" />
              Categories
            </div>
            <h1 className="mt-4 font-serif text-[2.4rem] leading-none text-[var(--ink)]">
              Recurrent Post Categories
            </h1>
            <p className="mt-3 max-w-[760px] text-sm leading-7 text-[var(--muted)]">
              Keep the mix weighted toward takes and product updates. Use source shares about weekly,
              then layer hype and hiring when there is a real reason.
            </p>
          </div>

          <Link
            href="/dashboard/schedules/new"
            className="inline-flex items-center gap-2 rounded-[12px] bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-[var(--sand)]"
          >
            <Plus className="h-4 w-4" />
            New Schedule
          </Link>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {rows.map((category) => (
          <SectionCard
            key={category.value}
            title={category.label}
            subtitle={category.description}
            action={
              <Link
                href={`/dashboard/schedules/new?category=${encodeURIComponent(category.value)}`}
                className="inline-flex items-center gap-2 text-sm font-semibold"
                style={{ color: CATEGORY_ACCENTS[category.value] || "var(--accent-tech)" }}
              >
                Add slot
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
            className="relative overflow-hidden"
          >
            <div
              className="absolute left-0 top-0 h-full w-1 rounded-l-[24px]"
              style={{ background: CATEGORY_ACCENTS[category.value] || "var(--accent-tech)" }}
            />

            <div className="space-y-4 pl-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone="neutral">{category.cadenceHint}</StatusBadge>
                <StatusBadge tone={category.enabled > 0 ? "good" : "warn"}>
                  {category.enabled} live
                </StatusBadge>
                <StatusBadge tone="neutral">{category.total} total</StatusBadge>
              </div>

              {category.schedules.length === 0 ? (
                <div className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-4 text-sm text-[var(--muted)]">
                  No schedules in this category yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {category.schedules.map((schedule) => (
                    <Link
                      key={schedule.id}
                      href={`/dashboard/schedules/${schedule.id}`}
                      className="block rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.03)] px-4 py-4 transition hover:border-[rgba(15,126,169,0.18)] hover:bg-white"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--ink)]">{schedule.name}</p>
                          <p className="mt-1 text-xs text-[var(--muted)]">
                            {schedule.cronHuman || schedule.cron}
                          </p>
                        </div>
                        <StatusBadge tone={schedule.enabled ? "good" : "neutral"}>
                          {schedule.enabled ? "enabled" : "disabled"}
                        </StatusBadge>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
                        <span>{schedule.jobType.replace(/_/g, " ")}</span>
                        <span>•</span>
                        <span>{schedule.targetCount} platform{schedule.targetCount === 1 ? "" : "s"}</span>
                        {schedule.nextRunAt ? (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <CalendarClock className="h-3.5 w-3.5" />
                              {formatDateInZone(schedule.nextRunAt)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        ))}
      </div>
    </div>
  );
}
