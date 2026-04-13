const APP_TIME_ZONE = process.env.TZ?.trim() || "America/New_York";

type ZonedDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function parsePart(parts: Intl.DateTimeFormatPart[], type: string): number {
  const value = parts.find((part) => part.type === type)?.value;
  return Number.parseInt(value ?? "0", 10);
}

export function getAppTimeZone() {
  return APP_TIME_ZONE;
}

export function getZonedDateParts(
  date: Date,
  timeZone = APP_TIME_ZONE
): ZonedDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);

  const weekdayLabel =
    parts.find((part) => part.type === "weekday")?.value ?? "Sun";

  return {
    year: parsePart(parts, "year"),
    month: parsePart(parts, "month"),
    day: parsePart(parts, "day"),
    hour: parsePart(parts, "hour"),
    minute: parsePart(parts, "minute"),
    weekday: WEEKDAY_INDEX[weekdayLabel] ?? 0,
  };
}

export function formatDateInZone(
  date: Date | number | string,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  },
  timeZone = APP_TIME_ZONE
) {
  return new Intl.DateTimeFormat("en-US", {
    ...options,
    timeZone,
  }).format(new Date(date));
}

export function formatTimeInZone(
  date: Date | number | string,
  timeZone = APP_TIME_ZONE
) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(date));
}
