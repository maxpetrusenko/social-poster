import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CalendarClock } from "lucide-react";
import { getDashboardInsights, type ScheduleInsight } from "@/lib/dashboard/insights";
import { getCronOccurrences } from "@/lib/dashboard/cron";
import { POST_CATEGORIES } from "@/lib/post-categories";
import { formatTimeInZone, getAppTimeZone, getZonedDateParts } from "@/lib/timezone";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

const CATEGORY_ACCENTS: Record<string, string> = {
  opinion_take: "#2f9fb5",
  product_update: "#3f8cff",
  source_share: "#ef6a67",
  hype_future: "#8a69d8",
  hiring_signal: "#d28a1d",
};

const CATEGORY_SURFACES: Record<string, string> = {
  opinion_take: "#d9f4f4",
  product_update: "#e1ebff",
  source_share: "#ffe1df",
  hype_future: "#ece0ff",
  hiring_signal: "#fff1cf",
};

const WEEK_DAYS = [
  { index: 1, label: "Monday" },
  { index: 2, label: "Tuesday" },
  { index: 3, label: "Wednesday" },
  { index: 4, label: "Thursday" },
  { index: 5, label: "Friday" },
  { index: 6, label: "Saturday" },
  { index: 0, label: "Sunday" },
] as const;

type GridEvent = {
  id: string;
  label: string;
  timeLabel: string;
  dayIndex: number;
  hour: number;
  minute: number;
  href: string;
  accent: string;
  surface: string;
};

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setDate(value.getDate() + diff);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfWeek(date: Date) {
  const value = new Date(date);
  value.setDate(value.getDate() + 6);
  value.setHours(23, 59, 59, 999);
  return value;
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value}:00 ${suffix}`;
}

function slotLabel(schedule: ScheduleInsight) {
  return schedule.contentCategoryLabel || schedule.name;
}

function buildGridEvents(scheduleInsights: ScheduleInsight[]) {
  const weekStart = startOfWeek(new Date());
  const weekEnd = endOfWeek(weekStart);
  const timeZone = getAppTimeZone();

  return scheduleInsights
    .filter((schedule) => schedule.enabled)
    .flatMap((schedule) => {
      const occurrences = getCronOccurrences(schedule.cron, weekStart, weekEnd, 64, timeZone);
      const accent = CATEGORY_ACCENTS[schedule.contentCategory || ""] || "#7d8aa0";
      const surface = CATEGORY_SURFACES[schedule.contentCategory || ""] || "#e7edf5";

      return occurrences.map((at) => {
        const parts = getZonedDateParts(at, timeZone);

        return {
          id: `${schedule.id}-${at.toISOString()}`,
          label: slotLabel(schedule),
          timeLabel: formatTimeInZone(at, timeZone),
          dayIndex: parts.weekday,
          hour: parts.hour,
          minute: parts.minute,
          href: `/dashboard/schedules/${schedule.id}`,
          accent,
          surface,
        } satisfies GridEvent;
      });
    })
    .sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      if (a.hour !== b.hour) return a.hour - b.hour;
      if (a.minute !== b.minute) return a.minute - b.minute;
      return a.label.localeCompare(b.label);
    });
}

export default async function CategoriesPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const { scheduleInsights } = await getDashboardInsights(tenant.currentWorkspace.id);
  const gridEvents = buildGridEvents(scheduleInsights);

  const eventsByCell = gridEvents.reduce<Map<string, GridEvent[]>>((accumulator, event) => {
    const key = `${event.dayIndex}-${event.hour}`;
    const current = accumulator.get(key) ?? [];
    current.push(event);
    accumulator.set(key, current);
    return accumulator;
  }, new Map());

  const minHour = gridEvents.length > 0 ? Math.min(7, ...gridEvents.map((event) => event.hour)) : 7;
  const maxHour = gridEvents.length > 0 ? Math.max(15, ...gridEvents.map((event) => event.hour)) : 15;
  const allHours = Array.from({ length: maxHour - minHour + 1 }, (_, index) => minHour + index);
  const visibleHours = allHours;

  const categoryStats = POST_CATEGORIES.map((category) => {
    const schedules = scheduleInsights.filter(
      (schedule) => schedule.contentCategory === category.value
    );

    return {
      ...category,
      count: schedules.length,
      live: schedules.filter((schedule) => schedule.enabled).length,
      accent: CATEGORY_ACCENTS[category.value] || "#7d8aa0",
      surface: CATEGORY_SURFACES[category.value] || "#e7edf5",
    };
  });

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fffdf7_0%,transparent_28%),linear-gradient(180deg,#f6efe4_0%,#efe5d7_100%)]">
      <div className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8 xl:px-10">
        <div className="mb-4 flex justify-end">
          <Link
            href="/dashboard/categories/manage"
            className="inline-flex items-center gap-2 rounded-full bg-[#1777ff] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(23,119,255,0.24)] transition hover:bg-[#0f64dd]"
          >
            Manage Categories
          </Link>
        </div>

        <section className="overflow-hidden rounded-[30px] border border-[#d7cab9] bg-[rgba(255,252,247,0.94)] shadow-[0_22px_55px_rgba(23,23,23,0.05)]">
          <div className="overflow-x-auto">
            <div className="min-w-[1100px]">
              <div className="grid grid-cols-[140px_repeat(7,minmax(0,1fr))] border-b border-[#ded4c7] bg-[#f6eee1]">
                <div className="border-r border-[#ded4c7] px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-[#8d7c64]">
                  Time
                </div>
                {WEEK_DAYS.map((day) => (
                  <div
                    key={day.label}
                    className="border-r border-[#ded4c7] px-4 py-4 text-center text-sm font-semibold text-[#3f352a] last:border-r-0"
                  >
                    {day.label}
                  </div>
                ))}
              </div>

              {visibleHours.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-[#6f614d]">
                  No recurring slots in the current week.
                </div>
              ) : (
                <div className="grid grid-cols-[140px_repeat(7,minmax(0,1fr))]">
                  {visibleHours.flatMap((hour) => [
                    <div
                      key={`time-${hour}`}
                      className="border-b border-r border-[#e6ddd0] bg-[#f8f2e8] px-5 py-5 text-xl font-medium text-[#3f352a]"
                    >
                      {hourLabel(hour)}
                    </div>,
                    ...WEEK_DAYS.map((day) => {
                      const key = `${day.index}-${hour}`;
                      const items = (eventsByCell.get(key) ?? []).sort((a, b) => a.minute - b.minute);

                      return (
                        <div
                          key={key}
                          className="min-h-[82px] border-b border-r border-[#e6ddd0] bg-[#fffdf9] p-3 last:border-r-0"
                        >
                          {items.length === 0 ? null : (
                            <div className="space-y-2">
                              {items.map((item) => (
                                <Link
                                  key={item.id}
                                  href={item.href}
                                  className="block rounded-[10px] border px-3 py-2 text-center transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(23,23,23,0.10)]"
                                  style={{
                                    background: item.surface,
                                    borderColor: `${item.accent}55`,
                                    color: item.accent,
                                  }}
                                >
                                  <span className="block truncate text-[11px] font-semibold leading-tight">
                                    {item.label}
                                  </span>
                                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.08em] opacity-80">
                                    {item.timeLabel}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }),
                  ])}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[30px] border border-[#d8cab5] bg-[rgba(255,250,242,0.92)] p-6 shadow-[0_22px_55px_rgba(23,23,23,0.05)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
                Category Lanes
              </p>
              <p className="mt-2 text-sm text-[#6f614d]">
                Each lane maps to schedule presets. Add a slot directly into the category you want.
              </p>
            </div>
            <Link
              href="/dashboard/schedules/new"
              className="inline-flex items-center gap-2 rounded-[14px] border border-[#d8cab5] bg-white px-4 py-2.5 text-sm font-semibold text-[#171717] transition hover:bg-[#faf4ea]"
            >
              New Schedule
            </Link>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {categoryStats.map((category) => (
              <Link
                key={category.value}
                href={`/dashboard/schedules/new?category=${encodeURIComponent(category.value)}`}
                className="rounded-[20px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(23,23,23,0.08)]"
                style={{
                  background: category.surface,
                  borderColor: `${category.accent}44`,
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#171717]">{category.label}</p>
                    <p className="mt-1 text-sm leading-6 text-[#5e5242]">{category.description}</p>
                  </div>
                  <span
                    className="inline-flex h-3.5 w-3.5 rounded-full"
                    style={{ background: category.accent }}
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#6f614d]">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {category.live} live
                  </span>
                  <span>{category.count} total</span>
                  <span>{category.cadenceHint}</span>
                </div>

                <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#171717]">
                  Add slot
                  <ArrowUpRight className="h-4 w-4" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
