import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { CalendarControls } from "@/components/dashboard/calendar-controls";
import {
  CalendarEventSurface,
  type CalendarSurfaceEvent,
} from "@/components/dashboard/calendar-event-surface";
import { SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { getCalendarInsights } from "@/lib/dashboard/calendar";
import { getZonedDateParts } from "@/lib/timezone";

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

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

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

  const calendar = await getCalendarInsights(monthParam);
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-[2.4rem] leading-none tracking-[-0.04em] text-[var(--ink)]">
          Calendar
        </h1>
      </div>

      <SectionCard
        title={view === "calendar" ? "Month View" : "List View"}
        subtitle="Grey scheduled. green posted. red failed. yellow running."
        action={
          <CalendarControls
            monthLabel={calendar.monthLabel}
            currentMonth={monthParam}
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
          <StatusBadge tone="neutral">scheduled manual</StatusBadge>
          <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-800">
            recurring
          </span>
          <StatusBadge tone="blocked">paused</StatusBadge>
          <StatusBadge tone="neutral">scheduled</StatusBadge>
          <StatusBadge tone="good">posted</StatusBadge>
          <StatusBadge tone="bad">failed</StatusBadge>
          <StatusBadge tone="warn">running</StatusBadge>
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
