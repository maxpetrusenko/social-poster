import { getAppTimeZone, getZonedDateParts } from "@/lib/timezone";

export function formatCalendarMonth(year: number, monthIndex: number) {
  const normalized = new Date(Date.UTC(year, monthIndex, 1));
  return `${normalized.getUTCFullYear()}-${String(
    normalized.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

export function getCurrentCalendarMonth(
  date = new Date(),
  timeZone = getAppTimeZone()
) {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function getCalendarDays(year: number, monthIndex: number) {
  const firstDay = new Date(Date.UTC(year, monthIndex, 1));
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0));
  const daysInMonth = lastDay.getUTCDate();
  const startingDayOfWeek = firstDay.getUTCDay();

  const days: Array<string | null> = [];
  for (let index = 0; index < startingDayOfWeek; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(
        2,
        "0"
      )}`
    );
  }
  return days;
}
