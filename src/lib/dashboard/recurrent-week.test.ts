import assert from "node:assert/strict";
import { test } from "vitest";

import type { ScheduleInsight } from "./insights";
import { buildGridEvents, getCurrentWeekRange, hourLabel } from "./recurrent-week";

function schedule(overrides: Partial<ScheduleInsight> = {}): ScheduleInsight {
  return {
    id: "weekly",
    name: "Weekly Post",
    cron: "0 15 * * 1",
    cronHuman: "Every Monday at 11 AM ET",
    jobType: "text_post",
    contentCategory: "opinion_take",
    contentCategoryLabel: "Opinion",
    enabled: true,
    targetPlatforms: ["x"],
    targetCount: 1,
    lastRunAt: null,
    lastStatus: null,
    nextRunAt: null,
    totalRuns: 0,
    completedRuns: 0,
    failedRuns: 0,
    successRate: 0,
    avgDurationSeconds: 0,
    lastError: null,
    ...overrides,
  };
}

test("getCurrentWeekRange uses the app timezone around UTC week rollover", () => {
  const range = getCurrentWeekRange(
    new Date("2026-06-01T03:30:00.000Z"),
    "America/New_York"
  );

  assert.equal(range.weekStart.toISOString(), "2026-05-25T04:00:00.000Z");
  assert.equal(range.weekEnd.toISOString(), "2026-06-01T04:00:00.000Z");
});

test("buildGridEvents keeps earlier current-week slots visible after UTC rolls into next week", () => {
  const events = buildGridEvents(
    [schedule()],
    new Date("2026-06-01T03:30:00.000Z"),
    "America/New_York",
    "UTC"
  );

  assert.ok(events.some((event) => event.id.endsWith("2026-05-25T15:00:00.000Z")));
  assert.equal(events[0]?.dayIndex, 1);
  assert.equal(events[0]?.hour, 11);
  assert.equal(events[0]?.label, "Opinion");
});

test("buildGridEvents includes a current-week category slot near UTC Monday", () => {
  const events = buildGridEvents(
    [
      schedule({
        id: "referral",
        cron: "30 18 * * 4",
        contentCategory: "hiring_signal",
        contentCategoryLabel: "Hiring / Referral",
      }),
    ],
    new Date("2026-06-01T03:30:00.000Z"),
    "America/New_York",
    "UTC"
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "referral-2026-05-28T18:30:00.000Z");
  assert.equal(events[0]?.dayIndex, 4);
  assert.equal(events[0]?.label, "Hiring / Referral");
  assert.equal(events[0]?.href, "/dashboard/schedules/referral");
});

test("buildGridEvents maps Monday UTC cron slots to late Sunday app time", () => {
  const events = buildGridEvents(
    [schedule({ cron: "30 3 * * 1" })],
    new Date("2026-05-27T12:00:00.000Z"),
    "America/New_York",
    "UTC"
  );

  assert.equal(events.length, 1);
  assert.equal(events[0]?.id, "weekly-2026-06-01T03:30:00.000Z");
  assert.equal(events[0]?.dayIndex, 0);
  assert.equal(events[0]?.hour, 23);
  assert.equal(events[0]?.minute, 30);
});

test("buildGridEvents excludes disabled and reply-engine schedules", () => {
  const events = buildGridEvents(
    [
      schedule({ id: "enabled" }),
      schedule({ id: "disabled", enabled: false }),
      schedule({ id: "reply", jobType: "reply_engine" }),
    ],
    new Date("2026-05-27T12:00:00.000Z"),
    "America/New_York",
    "UTC"
  );

  assert.deepEqual(
    events.map((event) => event.id.split("-")[0]),
    ["enabled"]
  );
});

test("hourLabel formats compact operator-grid hours", () => {
  assert.equal(hourLabel(0), "12:00 AM");
  assert.equal(hourLabel(12), "12:00 PM");
  assert.equal(hourLabel(15), "3:00 PM");
});
