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

const zonedPartsFormatterCache = new Map<string, Intl.DateTimeFormat>();
const zonedPartsCache = new Map<string, ZonedDateParts>();
const genericFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getCachedFormatter(
  cache: Map<string, Intl.DateTimeFormat>,
  key: string,
  create: () => Intl.DateTimeFormat
) {
  const existing = cache.get(key);
  if (existing) return existing;

  const formatter = create();
  cache.set(key, formatter);
  return formatter;
}

function getZonedPartsFormatter(timeZone: string) {
  return getCachedFormatter(
    zonedPartsFormatterCache,
    timeZone,
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        hourCycle: "h23",
        weekday: "short",
      })
  );
}

function getGenericFormatter(
  options: Intl.DateTimeFormatOptions,
  timeZone: string
) {
  const key = JSON.stringify([timeZone, options]);
  return getCachedFormatter(
    genericFormatterCache,
    key,
    () =>
      new Intl.DateTimeFormat("en-US", {
        ...options,
        timeZone,
      })
  );
}

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
  const cacheKey = `${timeZone}:${date.getTime()}`;
  const cached = zonedPartsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const parts = getZonedPartsFormatter(timeZone).formatToParts(date);

  const weekdayLabel =
    parts.find((part) => part.type === "weekday")?.value ?? "Sun";

  const value = {
    year: parsePart(parts, "year"),
    month: parsePart(parts, "month"),
    day: parsePart(parts, "day"),
    hour: parsePart(parts, "hour"),
    minute: parsePart(parts, "minute"),
    weekday: WEEKDAY_INDEX[weekdayLabel] ?? 0,
  };

  if (zonedPartsCache.size > 100_000) {
    zonedPartsCache.clear();
  }
  zonedPartsCache.set(cacheKey, value);

  return value;
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
  return getGenericFormatter(options, timeZone).format(new Date(date));
}

export function formatTimeInZone(
  date: Date | number | string,
  timeZone = APP_TIME_ZONE
) {
  return getGenericFormatter(
    {
      hour: "numeric",
      minute: "2-digit",
    },
    timeZone
  ).format(new Date(date));
}
