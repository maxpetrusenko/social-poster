import { expect, test } from "vitest";

import {
  formatCalendarMonth,
  getCalendarDays,
  getCurrentCalendarMonth,
} from "../dashboard/calendar-month.ts";

test("getCalendarDays keeps civil month days stable on UTC servers", () => {
  const days = getCalendarDays(2026, 4).filter(Boolean);

  expect(days[0]).toBe("2026-05-01");
  expect(days.at(-1)).toBe("2026-05-31");
});

test("formatCalendarMonth moves between months without timezone drift", () => {
  expect(formatCalendarMonth(2026, 4 - 1)).toBe("2026-04");
  expect(formatCalendarMonth(2026, 4 + 1)).toBe("2026-06");
  expect(formatCalendarMonth(2026, -1)).toBe("2025-12");
});

test("getCurrentCalendarMonth uses app timezone instead of UTC month", () => {
  expect(
    getCurrentCalendarMonth(new Date("2026-06-01T03:30:00.000Z"), "America/New_York"),
  ).toBe("2026-05");
});
