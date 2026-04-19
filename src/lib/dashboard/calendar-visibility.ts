type CalendarScheduleLike = {
  jobType: string;
};

type CalendarRunLike = {
  scheduleId: string | null;
};

export function isReplyEngineSchedule(schedule?: CalendarScheduleLike | null) {
  return schedule?.jobType === "reply_engine";
}

export function isCalendarVisibleSchedule(schedule: CalendarScheduleLike) {
  return !isReplyEngineSchedule(schedule);
}

export function isCalendarVisibleRun<TSchedule extends CalendarScheduleLike>(
  run: CalendarRunLike,
  scheduleMap: Map<string, TSchedule>
) {
  if (!run.scheduleId) return true;
  return !isReplyEngineSchedule(scheduleMap.get(run.scheduleId));
}
