import { getCronOccurrences } from "@/lib/dashboard/cron";
import type { ScheduleInsight } from "@/lib/dashboard/insights";
import {
  dateFromZonedParts,
  formatTimeInZone,
  getAppTimeZone,
  getScheduleCronTimeZone,
  getZonedDateParts,
} from "@/lib/timezone";

export const WEEK_DAYS = [
  { index: 1, label: "Monday" },
  { index: 2, label: "Tuesday" },
  { index: 3, label: "Wednesday" },
  { index: 4, label: "Thursday" },
  { index: 5, label: "Friday" },
  { index: 6, label: "Saturday" },
  { index: 0, label: "Sunday" },
] as const;

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

export type RecurrentGridEvent = {
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

type CivilDay = {
  year: number;
  month: number;
  day: number;
};

function addCivilDays(day: CivilDay, days: number): CivilDay {
  const value = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

export function getCurrentWeekRange(
  date = new Date(),
  timeZone = getAppTimeZone()
) {
  const parts = getZonedDateParts(date, timeZone);
  const startOffset = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  const weekStartDay = addCivilDays(parts, startOffset);
  const weekEndDay = addCivilDays(weekStartDay, 7);

  return {
    weekStart: dateFromZonedParts(weekStartDay, timeZone),
    weekEnd: dateFromZonedParts(weekEndDay, timeZone),
  };
}

export function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const value = hour % 12 || 12;
  return `${value}:00 ${suffix}`;
}

function slotLabel(schedule: ScheduleInsight) {
  return schedule.contentCategoryLabel || schedule.name;
}

export function buildGridEvents(
  scheduleInsights: ScheduleInsight[],
  now = new Date(),
  displayTimeZone = getAppTimeZone(),
  cronTimeZone = getScheduleCronTimeZone()
) {
  const { weekStart, weekEnd } = getCurrentWeekRange(now, displayTimeZone);
  const occurrenceEnd = new Date(weekEnd.getTime() - 1);

  return scheduleInsights
    .filter((schedule) => schedule.enabled && schedule.jobType !== "reply_engine")
    .flatMap((schedule) => {
      const occurrences = getCronOccurrences(
        schedule.cron,
        weekStart,
        occurrenceEnd,
        64,
        cronTimeZone
      );
      const accent = CATEGORY_ACCENTS[schedule.contentCategory || ""] || "#7d8aa0";
      const surface = CATEGORY_SURFACES[schedule.contentCategory || ""] || "#e7edf5";

      return occurrences.map((at) => {
        const parts = getZonedDateParts(at, displayTimeZone);

        return {
          id: `${schedule.id}-${at.toISOString()}`,
          label: slotLabel(schedule),
          timeLabel: formatTimeInZone(at, displayTimeZone),
          dayIndex: parts.weekday,
          hour: parts.hour,
          minute: parts.minute,
          href: `/dashboard/schedules/${schedule.id}`,
          accent,
          surface,
        } satisfies RecurrentGridEvent;
      });
    })
    .sort((a, b) => {
      if (a.dayIndex !== b.dayIndex) return a.dayIndex - b.dayIndex;
      if (a.hour !== b.hour) return a.hour - b.hour;
      if (a.minute !== b.minute) return a.minute - b.minute;
      return a.label.localeCompare(b.label);
    });
}
