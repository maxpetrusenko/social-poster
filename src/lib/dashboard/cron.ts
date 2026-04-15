import { getScheduleCronTimeZone, getZonedDateParts } from "@/lib/timezone";

const FIELD_RANGES = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const;

type ParsedCron = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
};

const cache = new Map<string, ParsedCron>();

function normalizeWeekday(value: number) {
  return value === 7 ? 0 : value;
}

function expandToken(token: string, min: number, max: number, isWeekday = false): number[] {
  const stepParts = token.split("/");
  const base = stepParts[0] || "*";
  const step = stepParts[1] ? Number.parseInt(stepParts[1], 10) : 1;
  if (!Number.isFinite(step) || step < 1) return [];

  let start = min;
  let end = max;

  if (base !== "*") {
    if (base.includes("-")) {
      const [rawStart, rawEnd] = base.split("-");
      start = Number.parseInt(rawStart, 10);
      end = Number.parseInt(rawEnd, 10);
    } else {
      start = Number.parseInt(base, 10);
      end = start;
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

  const values: number[] = [];
  for (let value = start; value <= end; value += step) {
    if (value < min || value > max) continue;
    values.push(isWeekday ? normalizeWeekday(value) : value);
  }
  return values;
}

function parseField(field: string, index: number): Set<number> {
  const { min, max } = FIELD_RANGES[index];
  const isWeekday = index === 4;
  if (field.trim() === "*") {
    return new Set(
      Array.from({ length: max - min + 1 }, (_, offset) =>
        isWeekday ? normalizeWeekday(min + offset) : min + offset
      )
    );
  }

  const values = new Set<number>();
  for (const token of field.split(",")) {
    for (const value of expandToken(token.trim(), min, max, isWeekday)) {
      values.add(value);
    }
  }
  return values;
}

function parseCron(expression: string): ParsedCron | null {
  if (cache.has(expression)) return cache.get(expression)!;

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const parsed: ParsedCron = {
    minute: parseField(parts[0], 0),
    hour: parseField(parts[1], 1),
    dayOfMonth: parseField(parts[2], 2),
    month: parseField(parts[3], 3),
    dayOfWeek: parseField(parts[4], 4),
  };

  cache.set(expression, parsed);
  return parsed;
}

function matches(parsed: ParsedCron, date: Date, timeZone: string): boolean {
  const parts = getZonedDateParts(date, timeZone);
  return (
    parsed.minute.has(parts.minute) &&
    parsed.hour.has(parts.hour) &&
    parsed.dayOfMonth.has(parts.day) &&
    parsed.month.has(parts.month) &&
    parsed.dayOfWeek.has(parts.weekday)
  );
}

function ceilToMinute(date: Date): Date {
  const value = new Date(date);
  value.setSeconds(0, 0);
  if (value.getTime() < date.getTime()) {
    value.setMinutes(value.getMinutes() + 1);
  }
  return value;
}

export function getCronOccurrences(
  expression: string,
  start: Date,
  end: Date,
  limit = 500,
  timeZone = getScheduleCronTimeZone()
): Date[] {
  const parsed = parseCron(expression);
  if (!parsed) return [];

  const cursor = ceilToMinute(start);
  const results: Date[] = [];

  while (cursor.getTime() <= end.getTime() && results.length < limit) {
    if (matches(parsed, cursor, timeZone)) {
      results.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return results;
}

export function getNextCronOccurrence(
  expression: string,
  from: Date,
  lookaheadDays = 60,
  timeZone = getScheduleCronTimeZone()
): Date | null {
  const end = new Date(from);
  end.setDate(end.getDate() + lookaheadDays);
  return getCronOccurrences(expression, from, end, 1, timeZone)[0] ?? null;
}
