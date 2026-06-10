import { dateFromZonedParts, getZonedDateParts } from "@/lib/timezone";

export const X_LIKED_AUTOPUBLISH_START_HOUR = 8;
export const X_LIKED_AUTOPUBLISH_END_HOUR = 20;

type SlotOptions = {
  now?: Date;
  existingSlots?: Date[];
  timeZone?: string;
  startHour?: number;
  endHour?: number;
};

type PublishTargetLike = {
  platform: { type: string };
  content: string;
};

function slotKey(date: Date, timeZone: string) {
  const parts = getZonedDateParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}:${parts.hour}`;
}

function addDays(parts: ReturnType<typeof getZonedDateParts>, days: number) {
  const utcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return getZonedDateParts(utcNoon, "UTC");
}

function firstCandidateSlot(options: Required<Omit<SlotOptions, "existingSlots">>) {
  const parts = getZonedDateParts(options.now, options.timeZone);
  let hour = options.startHour;
  let dayParts = parts;

  if (parts.hour < options.startHour) {
    hour = options.startHour;
  } else if (
    parts.hour < options.endHour ||
    (parts.hour === options.endHour && parts.minute === 0)
  ) {
    hour = parts.minute === 0 ? parts.hour : parts.hour + 1;
  } else {
    dayParts = addDays(parts, 1);
    hour = options.startHour;
  }

  if (hour > options.endHour) {
    dayParts = addDays(parts, 1);
    hour = options.startHour;
  }

  return dateFromZonedParts(
    {
      year: dayParts.year,
      month: dayParts.month,
      day: dayParts.day,
      hour,
      minute: 0,
    },
    options.timeZone
  );
}

function nextSlot(slot: Date, options: Required<Omit<SlotOptions, "existingSlots" | "now">>) {
  const parts = getZonedDateParts(slot, options.timeZone);
  if (parts.hour < options.endHour) {
    return dateFromZonedParts(
      {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        hour: parts.hour + 1,
        minute: 0,
      },
      options.timeZone
    );
  }

  const nextDay = addDays(parts, 1);
  return dateFromZonedParts(
    {
      year: nextDay.year,
      month: nextDay.month,
      day: nextDay.day,
      hour: options.startHour,
      minute: 0,
    },
    options.timeZone
  );
}

export function findNextXLikedAutopostSlot(options: SlotOptions = {}) {
  const normalized = {
    now: options.now ?? new Date(),
    timeZone: options.timeZone || "America/New_York",
    startHour: options.startHour ?? X_LIKED_AUTOPUBLISH_START_HOUR,
    endHour: options.endHour ?? X_LIKED_AUTOPUBLISH_END_HOUR,
  };
  const occupied = new Set(
    (options.existingSlots ?? []).map((slot) => slotKey(slot, normalized.timeZone))
  );
  let candidate = firstCandidateSlot(normalized);

  while (occupied.has(slotKey(candidate, normalized.timeZone))) {
    candidate = nextSlot(candidate, normalized);
  }

  return candidate;
}

export function validateXLikedPublishTargets(targets: PublishTargetLike[]) {
  return targets
    .map((target) => ({
      platform: target.platform.type,
      reason: target.content.trim() ? null : "empty platform content",
    }))
    .filter((entry): entry is { platform: string; reason: string } =>
      Boolean(entry.reason)
    );
}
