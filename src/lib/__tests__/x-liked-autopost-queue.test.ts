import { describe, expect, it } from "vitest";

import {
  findNextXLikedAutopostSlot,
  getXLikedRecurringScheduleSlots,
  validateXLikedPublishTargets,
} from "../x-liked-autopost-queue";

describe("X liked autopost queue", () => {
  const timeZone = "America/New_York";

  it("uses the next hourly slot inside the 8 AM to 8 PM window", () => {
    const slot = findNextXLikedAutopostSlot({
      now: new Date("2026-06-10T13:15:00.000Z"),
      timeZone,
    });

    expect(slot.toISOString()).toBe("2026-06-10T14:00:00.000Z");
  });

  it("overflows occupied slots to the next day after 8 PM", () => {
    const existingSlots = [
      new Date("2026-06-10T14:00:00.000Z"),
      new Date("2026-06-10T15:00:00.000Z"),
      new Date("2026-06-10T16:00:00.000Z"),
      new Date("2026-06-10T17:00:00.000Z"),
      new Date("2026-06-10T18:00:00.000Z"),
      new Date("2026-06-10T19:00:00.000Z"),
      new Date("2026-06-10T20:00:00.000Z"),
      new Date("2026-06-10T21:00:00.000Z"),
      new Date("2026-06-10T22:00:00.000Z"),
      new Date("2026-06-10T23:00:00.000Z"),
      new Date("2026-06-11T00:00:00.000Z"),
    ];

    const slot = findNextXLikedAutopostSlot({
      now: new Date("2026-06-10T13:30:00.000Z"),
      existingSlots,
      timeZone,
    });

    expect(slot.toISOString()).toBe("2026-06-11T12:00:00.000Z");
  });

  it("skips recurring scheduler slots when queueing liked posts", () => {
    const now = new Date("2026-06-11T14:30:00.000Z");
    const recurringSlots = getXLikedRecurringScheduleSlots({
      now,
      cronTimeZone: "UTC",
      lookaheadDays: 1,
      schedules: [
        { cron: "0 15 * * *", enabled: true, jobType: "image_post" },
        { cron: "0 17 * * *", enabled: true, jobType: "image_post" },
        { cron: "0 19 * * *", enabled: true, jobType: "text_post" },
      ],
    });

    const slot = findNextXLikedAutopostSlot({
      now,
      existingSlots: recurringSlots,
      timeZone,
    });

    expect(slot.toISOString()).toBe("2026-06-11T16:00:00.000Z");
  });

  it("rejects empty final platform content before queueing", () => {
    expect(
      validateXLikedPublishTargets([
        { platform: { type: "x" }, content: "usable" },
        { platform: { type: "linkedin_personal" }, content: "   " },
      ])
    ).toEqual([
      {
        platform: "linkedin_personal",
        reason: "empty platform content",
      },
    ]);
  });
});
