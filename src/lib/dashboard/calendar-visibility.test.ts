import assert from "node:assert/strict";
import test from "node:test";

import {
  isCalendarVisibleRun,
  isCalendarVisibleSchedule,
  isReplyEngineSchedule,
} from "./calendar-visibility.ts";

test("reply engine schedules stay out of calendar surfaces", () => {
  const replySchedule = { id: "reply", jobType: "reply_engine" };
  const postSchedule = { id: "post", jobType: "text_post" };
  const scheduleMap = new Map([
    [replySchedule.id, replySchedule],
    [postSchedule.id, postSchedule],
  ]);

  assert.equal(isReplyEngineSchedule(replySchedule), true);
  assert.equal(isCalendarVisibleSchedule(replySchedule), false);
  assert.equal(isCalendarVisibleSchedule(postSchedule), true);
  assert.equal(isCalendarVisibleRun({ scheduleId: "reply" }, scheduleMap), false);
  assert.equal(isCalendarVisibleRun({ scheduleId: "post" }, scheduleMap), true);
  assert.equal(isCalendarVisibleRun({ scheduleId: null }, scheduleMap), true);
});
