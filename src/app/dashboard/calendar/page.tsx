import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarControls } from "@/components/dashboard/calendar-controls";
import {
  CalendarEventSurface,
  type CalendarSurfaceEvent,
} from "@/components/dashboard/calendar-event-surface";
import { SectionCard } from "@/components/dashboard/ui";
import { getCalendarInsights } from "@/lib/dashboard/calendar";
import { getZonedDateParts } from "@/lib/timezone";
import { getTenantContext } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function getCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1);
  const lastDay = new Date(year, monthIndex + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startingDayOfWeek = firstDay.getDay();

  const days: Array<string | null> = [];
  for (let index = 0; index < startingDayOfWeek; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = new Date(year, monthIndex, day);
    const parts = getZonedDateParts(value);
    days.push(
      `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
    );
  }
  return days;
}

function dayKey(date: Date) {
  const parts = getZonedDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function mediaSignature(event: CalendarSurfaceEvent) {
  return event.media
    .map((media) => media.code)
    .sort()
    .join("_")
    .toLowerCase();
}

function mediaFilterLabel(value: string) {
  if (value === "text") return "Text only";
  if (value === "image") return "Image only";
  if (value === "video") return "Video only";
  if (value === "image_text") return "Text + image";
  if (value === "text_video") return "Text + video";
  if (value === "image_video") return "Image + video";
  if (value === "image_text_video") return "Text + image + video";
  return value
    .split("_")
    .map((chunk) => chunk[0]?.toUpperCase() + chunk.slice(1))
    .join(" + ");
}

function matchesEvent(event: CalendarSurfaceEvent, filters: Record<string, string>) {
  if (filters.status === "paused" && event.tone !== "blocked") return false;
  if (filters.status === "scheduled" && event.tone !== "planned") return false;
  if (filters.status === "posted" && event.tone !== "completed") return false;
  if (filters.status === "failed" && event.tone !== "failed") return false;
  if (filters.status === "running" && event.tone !== "running") return false;

  if (filters.media !== "all" && mediaSignature(event) !== filters.media) return false;

  if (
    filters.platform !== "all" &&
    !event.platforms.some((platform) => platform.type === filters.platform)
  ) {
    return false;
  }

  if (filters.tag !== "all" && !event.tags.includes(filters.tag)) return false;

  return true;
}

function serializeEvent(event: Awaited<ReturnType<typeof getCalendarInsights>>["eventsByDay"][string][number]): CalendarSurfaceEvent {
  return {
    ...event,
    at: event.at.toISOString(),
  };
}

function buildQueryString(
  params: Record<string, string>,
  updates: Record<string, string | null>
) {
  const next = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) next.set(key, value);
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!value || value === "all") {
      next.delete(key);
    } else {
      next.set(key, value);
    }
  });

  return next.toString();
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const params = await searchParams;
  const monthParam = params.month || new Date().toISOString().slice(0, 7);
  const view = params.view === "list" ? "list" : "calendar";
  const filters = {
    status: params.status || "all",
    media: params.media || "all",
    platform: params.platform || "all",
    tag: params.tag || "all",
  };

  const [yearStr, monthStr] = monthParam.split("-");
  const year = Number.parseInt(yearStr, 10);
  const monthIndex = Number.parseInt(monthStr, 10) - 1;
  const prevMonthStr = new Date(year, monthIndex - 1, 1).toISOString().slice(0, 7);
  const nextMonthStr = new Date(year, monthIndex + 1, 1).toISOString().slice(0, 7);
  const todayMonth = new Date().toISOString().slice(0, 7);

  const calendar = await getCalendarInsights(monthParam, tenant.currentWorkspace.id);
  const rawEvents = Object.values(calendar.eventsByDay)
    .flat()
    .map(serializeEvent);
  const filteredEvents = rawEvents.filter((event) => matchesEvent(event, filters));
  const filteredEventsByDay = filteredEvents.reduce<Record<string, CalendarSurfaceEvent[]>>(
    (accumulator, event) => {
      accumulator[event.dayKey] ||= [];
      accumulator[event.dayKey].push(event);
      return accumulator;
    },
    {}
  );

  const platformOptions = [
    { value: "all", label: "Channels" },
    ...Array.from(
      rawEvents.reduce<Map<string, string>>((accumulator, event) => {
        event.platforms.forEach((platform) => {
          if (!accumulator.has(platform.type)) {
            accumulator.set(platform.type, platform.label);
          }
        });
        return accumulator;
      }, new Map())
    )
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const tagOptions = [
    { value: "all", label: "Tags" },
    ...Array.from(new Set(rawEvents.flatMap((event) => event.tags)))
      .sort((a, b) => a.localeCompare(b))
      .map((value) => ({ value, label: value })),
  ];

  const mediaOptions = [
    { value: "all", label: "All Types" },
    ...Array.from(
      new Set([
        "text",
        "image",
        "video",
        "image_text",
        "text_video",
        ...rawEvents.map((event) => mediaSignature(event)).filter(Boolean),
      ])
    )
      .sort()
      .map((value) => ({ value, label: mediaFilterLabel(value) })),
  ];

  const statusOptions = [
    { value: "all", label: "All Posts" },
    { value: "scheduled", label: "Scheduled" },
    { value: "paused", label: "Paused" },
    { value: "posted", label: "Posted" },
    { value: "running", label: "Running" },
    { value: "failed", label: "Failed" },
  ];

  const todayKey = dayKey(new Date());
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const groupedDayKeys = Array.from(new Set(filteredEvents.map((event) => event.dayKey)));

  return (
    <div className="space-y-6">
      <SectionCard
        title={view === "calendar" ? "Month View" : "List View"}
        action={
          <CalendarControls
            monthLabel={calendar.monthLabel}
            prevMonth={prevMonthStr}
            nextMonth={nextMonthStr}
            todayMonth={todayMonth}
            view={view}
            status={filters.status}
            media={filters.media}
            platform={filters.platform}
            tag={filters.tag}
            statusOptions={statusOptions}
            mediaOptions={mediaOptions}
            platformOptions={platformOptions}
            tagOptions={tagOptions}
          />
        }
      >
        <div className="mb-4 flex flex-wrap gap-2">
          {statusOptions.map((option) => {
            const active =
              (filters.status === "all" && option.value === "all")
              || filters.status === option.value;
            const tone =
              option.value === "paused"
                ? "blocked"
                : option.value === "posted"
                  ? "good"
                  : option.value === "failed"
                    ? "bad"
                    : option.value === "running"
                      ? "warn"
                      : "neutral";

            return (
              <Link
                key={option.value}
                href={`/dashboard/calendar?${buildQueryString(params, {
                  status: option.value === "all" ? null : option.value,
                })}`}
                className={cn(
                  "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]",
                  active
                    ? tone === "blocked"
                      ? "border-stone-100 bg-stone-50/70 text-stone-500"
                      : tone === "good"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : tone === "bad"
                          ? "border-red-200 bg-red-50 text-red-700"
                          : tone === "warn"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-[rgba(12,17,21,0.08)] bg-white text-[var(--muted)] hover:border-[rgba(12,17,21,0.16)] hover:text-[var(--ink)]"
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        <CalendarEventSurface
          view={view}
          labels={labels}
          days={getCalendarDays(year, monthIndex)}
          eventsByDay={filteredEventsByDay}
          groupedDayKeys={groupedDayKeys}
          todayKey={todayKey}
        />
      </SectionCard>
    </div>
  );
}
