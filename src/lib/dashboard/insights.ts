import { db } from "@/db";
import { pipelineRuns, platforms, posts, replyEvents, schedules } from "@/db/schema";
import { and, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { getCronOccurrences, getNextCronOccurrence } from "./cron";
import { getPlatformLabel, getPlatformMeta, normalizePlatformType } from "./platforms";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";
import { getSchedulerSnapshot } from "@/lib/scheduler";
import { getPostCategoryMeta } from "@/lib/post-categories";
import {
  getDashboardWorkspaceScope,
  runTargetsWorkspace,
} from "./workspace-scope";

type RunRow = typeof pipelineRuns.$inferSelect;
type ScheduleRow = typeof schedules.$inferSelect;
type PlatformRow = typeof platforms.$inferSelect;
type PostRow = typeof posts.$inferSelect;
type ReplyEventRow = typeof replyEvents.$inferSelect;

type RunPublishDetails = {
  publishedPlatforms: string[];
  failedPlatforms: Array<{ platform: string; error: string }>;
};

export type DashboardTimeseriesPoint = {
  date: string;
  pieces: number;
  deliveries: number;
  failures: number;
};

export type ScheduleInsight = {
  id: string;
  name: string;
  cron: string;
  cronHuman: string | null;
  jobType: string;
  contentCategory: string | null;
  contentCategoryLabel: string | null;
  enabled: boolean;
  targetPlatforms: string[];
  targetCount: number;
  lastRunAt: Date | null;
  lastStatus: string | null;
  nextRunAt: Date | null;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  successRate: number;
  avgDurationSeconds: number;
  lastError: string | null;
};

export type PlatformInsight = {
  id: string;
  type: string;
  name: string;
  handle: string | null;
  provider: string;
  enabled: boolean;
  scheduleCount: number;
  deliveryCount30d: number;
  failureCount30d: number;
  successRate30d: number;
  lastDeliveredAt: Date | null;
  accent: string;
  shortLabel: string;
};

export type DashboardInsights = {
  publishedPieces30d: number;
  deliveryCount30d: number;
  failureCount30d: number;
  replyCount30d: number;
  consistencyScore30d: number;
  completionRate30d: number;
  streakDays: number;
  enabledPlatformCount: number;
  activeScheduleCount: number;
  runtimeScheduleCount: number;
  scheduleRuntimeDrift: number;
  lastPublishedAt: Date | null;
  timeseries: DashboardTimeseriesPoint[];
  scheduleInsights: ScheduleInsight[];
  platformInsights: PlatformInsight[];
  recentRuns: Array<RunRow & { scheduleName: string | null; publish: RunPublishDetails }>;
  recentPosts: PostRow[];
  recentReplies: ReplyEventRow[];
};

export type CalendarEvent = {
  id: string;
  dayKey: string;
  at: Date;
  label: string;
  tone: "planned" | "completed" | "failed" | "running";
  kind: "schedule" | "run";
};

export type CalendarInsights = {
  monthLabel: string;
  monthStart: Date;
  monthEnd: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function percent(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length / 100) / 10;
}

function parseErrorItem(item: unknown) {
  if (!item) return null;
  if (typeof item === "string") {
    const [platform, ...rest] = item.split(":");
    return {
      platform: normalizePlatformType(platform),
      error: rest.join(":").trim() || item,
    };
  }
  if (typeof item === "object") {
    const record = item as Record<string, unknown>;
    return {
      platform: normalizePlatformType(String(record.platform || "unknown")),
      error: String(record.error || "Unknown error"),
    };
  }
  return null;
}

function parseOutcomeItem(item: unknown) {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;

  return {
    platform: normalizePlatformType(String(record.platform || "unknown")),
    success: Boolean(record.success),
    error: typeof record.error === "string" ? record.error : null,
  };
}

function getRunPublishDetails(run: RunRow): RunPublishDetails {
  const publishedPlatforms = new Set<string>();
  const failedPlatforms = new Map<string, { platform: string; error: string }>();

  for (const step of run.steps ?? []) {
    if (!step.name.startsWith("publish")) {
      continue;
    }

    const output =
      step.output && typeof step.output === "object"
        ? (step.output as Record<string, unknown>)
        : null;

    if (output?.platform) {
      const parsed = parseOutcomeItem(output);
      if (!parsed) continue;

      if (parsed.success) {
        publishedPlatforms.add(parsed.platform);
      } else {
        failedPlatforms.set(parsed.platform, {
          platform: parsed.platform,
          error: parsed.error ?? "Unknown error",
        });
      }
      continue;
    }

    const publishedRaw = output?.published;
    const errorsRaw = output?.errors;
    const outcomesRaw = output?.outcomes;

    if (Array.isArray(publishedRaw)) {
      for (const item of publishedRaw) {
        publishedPlatforms.add(normalizePlatformType(String(item)));
      }
    }

    if (Array.isArray(errorsRaw)) {
      for (const item of errorsRaw) {
        const parsed = parseErrorItem(item);
        if (parsed) {
          failedPlatforms.set(parsed.platform, parsed);
        }
      }
    }

    if (Array.isArray(outcomesRaw)) {
      for (const item of outcomesRaw) {
        const parsed = parseOutcomeItem(item);
        if (!parsed) continue;
        if (parsed.success) {
          publishedPlatforms.add(parsed.platform);
        } else {
          failedPlatforms.set(parsed.platform, {
            platform: parsed.platform,
            error: parsed.error ?? "Unknown error",
          });
        }
      }
    }
  }

  return {
    publishedPlatforms: Array.from(publishedPlatforms),
    failedPlatforms: Array.from(failedPlatforms.values()),
  };
}

function buildTimeseries(runs: Array<RunRow & { publish: RunPublishDetails }>, days = 14) {
  const today = startOfDay(new Date());
  const points = Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - index - 1));
    return {
      date: dayKey(date),
      pieces: 0,
      deliveries: 0,
      failures: 0,
    };
  });

  const byDate = new Map(points.map((point) => [point.date, point]));
  for (const run of runs) {
    const key = dayKey(new Date(run.startedAt));
    const point = byDate.get(key);
    if (!point) continue;
    if (run.status === "completed" || run.publish.publishedPlatforms.length > 0) {
      point.pieces += 1;
    }
    point.deliveries += run.publish.publishedPlatforms.length;
    point.failures += run.publish.failedPlatforms.length + (run.status === "failed" ? 1 : 0);
  }

  return points;
}

function getStreakDays(runs: Array<RunRow & { publish: RunPublishDetails }>) {
  const successfulDates = new Set(
    runs
      .filter((run) => run.status === "completed" || run.publish.publishedPlatforms.length > 0)
      .map((run) => dayKey(new Date(run.startedAt)))
  );

  let streak = 0;
  const cursor = startOfDay(new Date());
  while (successfulDates.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildScheduleInsights(
  scheduleRows: ScheduleRow[],
  runRows: Array<RunRow & { publish: RunPublishDetails }>,
  platformRows: PlatformRow[]
): ScheduleInsight[] {
  const platformById = new Map(platformRows.map((platform) => [platform.id, platform]));

  return scheduleRows.map((schedule) => {
    const relatedRuns = runRows.filter((run) => run.scheduleId === schedule.id);
    const completedRuns = relatedRuns.filter((run) => run.status === "completed").length;
    const failedRuns = relatedRuns.filter((run) => run.status === "failed").length;
    const lastRun = relatedRuns[0] ?? null;
    const durations = relatedRuns
      .map((run) => run.durationMs)
      .filter((duration): duration is number => typeof duration === "number" && duration > 0);
    const targetPlatforms = (schedule.targetPlatformIds || [])
      .map((id) => platformById.get(id))
      .filter(Boolean)
      .map((platform) => getPlatformLabel(platform!.type));

    return {
      id: schedule.id,
      name: schedule.name,
      cron: schedule.cron,
      cronHuman: schedule.cronHuman,
      jobType: schedule.jobType,
      contentCategory: typeof schedule.config?.contentCategory === "string" ? schedule.config.contentCategory : null,
      contentCategoryLabel:
        getPostCategoryMeta(
          typeof schedule.config?.contentCategory === "string" ? schedule.config.contentCategory : null
        )?.label ?? null,
      enabled: schedule.enabled,
      targetPlatforms,
      targetCount: targetPlatforms.length,
      lastRunAt: lastRun?.startedAt ?? null,
      lastStatus: lastRun?.status ?? null,
      nextRunAt: schedule.enabled ? getNextCronOccurrence(schedule.cron, new Date()) : null,
      totalRuns: relatedRuns.length,
      completedRuns,
      failedRuns,
      successRate: percent(completedRuns, relatedRuns.length),
      avgDurationSeconds: average(durations),
      lastError: lastRun?.error ?? null,
    };
  });
}

function buildPlatformInsights(
  platformRows: PlatformRow[],
  scheduleRows: ScheduleRow[],
  runRows: Array<RunRow & { publish: RunPublishDetails }>
): PlatformInsight[] {
  const start30d = startOfDay(new Date());
  start30d.setDate(start30d.getDate() - 29);
  const matchingRuns30d = runRows.filter((run) => new Date(run.startedAt) >= start30d);

  return platformRows.map((platform) => {
    const normalized = normalizePlatformType(platform.type);
    const deliveryCount30d = matchingRuns30d.reduce(
      (sum, run) => sum + run.publish.publishedPlatforms.filter((item) => item === normalized).length,
      0
    );
    const failureCount30d = matchingRuns30d.reduce(
      (sum, run) => sum + run.publish.failedPlatforms.filter((item) => item.platform === normalized).length,
      0
    );
    const lastDelivered = matchingRuns30d.find((run) =>
      run.publish.publishedPlatforms.includes(normalized)
    );
    const scheduleCount = scheduleRows.filter((schedule) =>
      (schedule.targetPlatformIds || []).includes(platform.id)
    ).length;
    const totalAttempts = deliveryCount30d + failureCount30d;
    const meta = getPlatformMeta(normalized);

    return {
      id: platform.id,
      type: normalized,
      name: platform.name,
      handle: platform.handle,
      provider: platform.provider,
      enabled: platform.enabled,
      scheduleCount,
      deliveryCount30d,
      failureCount30d,
      successRate30d: percent(deliveryCount30d, totalAttempts),
      lastDeliveredAt: lastDelivered?.startedAt ?? null,
      accent: meta.accent,
      shortLabel: meta.shortLabel,
    };
  });
}

async function getScopedRunRows({
  workspaceId,
  scheduleIds,
  postIds,
  startedAtGte,
  startedAtLt,
}: {
  workspaceId: string;
  scheduleIds: string[];
  postIds: string[];
  startedAtGte?: Date;
  startedAtLt?: Date;
}): Promise<RunRow[]> {
  const scopeFilters = [eq(pipelineRuns.workspaceId, workspaceId)];
  const timeFilters = [];

  if (scheduleIds.length > 0) {
    scopeFilters.push(inArray(pipelineRuns.scheduleId, scheduleIds));
  }

  if (postIds.length > 0) {
    scopeFilters.push(inArray(pipelineRuns.postId, postIds));
  }

  if (scopeFilters.length === 0) {
    return [];
  }

  if (startedAtGte) {
    timeFilters.push(gte(pipelineRuns.startedAt, startedAtGte));
  }

  if (startedAtLt) {
    timeFilters.push(lt(pipelineRuns.startedAt, startedAtLt));
  }

  const scopeWhere =
    scopeFilters.length === 1 ? scopeFilters[0] : or(...scopeFilters);
  const where =
    timeFilters.length === 0 ? scopeWhere : and(...timeFilters, scopeWhere);

  return db
    .select()
    .from(pipelineRuns)
    .where(where)
    .orderBy(desc(pipelineRuns.startedAt));
}

export async function getDashboardInsights(
  workspaceId: string
): Promise<DashboardInsights> {
  const {
    platformRows,
    platformIds,
    scheduleRows,
    scheduleIdSet,
    postIds,
    postIdSet,
  } = await getDashboardWorkspaceScope(workspaceId);
  const scheduleIds = scheduleRows.map((schedule) => schedule.id);

  const [allRunRows, postRows, replyRows] = await Promise.all([
    getScopedRunRows({ workspaceId, scheduleIds, postIds }),
    postIds.length > 0
      ? db.select().from(posts).where(inArray(posts.id, postIds)).orderBy(desc(posts.createdAt))
      : Promise.resolve([] as PostRow[]),
    platformIds.length > 0
      ? db
          .select()
          .from(replyEvents)
          .where(inArray(replyEvents.platformId, platformIds))
          .orderBy(desc(replyEvents.createdAt))
      : Promise.resolve([] as ReplyEventRow[]),
  ]);

  const runRowsRaw = allRunRows.filter((run) =>
    runTargetsWorkspace(run, workspaceId, scheduleIdSet, postIdSet)
  );

  const runRows = runRowsRaw.map((run) => ({
    ...run,
    status: resolvePipelineRunStatus(run),
    publish: getRunPublishDetails(run),
  }));

  const start30d = startOfDay(new Date());
  start30d.setDate(start30d.getDate() - 29);
  const recent30dRuns = runRows.filter((run) => new Date(run.startedAt) >= start30d);

  const publishedPieces30d = recent30dRuns.filter(
    (run) => run.status === "completed" || run.publish.publishedPlatforms.length > 0
  ).length;
  const deliveryCount30d = recent30dRuns.reduce(
    (sum, run) => sum + run.publish.publishedPlatforms.length,
    0
  );
  const failureCount30d = recent30dRuns.reduce(
    (sum, run) => sum + run.publish.failedPlatforms.length + (run.status === "failed" ? 1 : 0),
    0
  );
  const replyCount30d = replyRows.filter(
    (reply) => reply.status === "sent" && new Date(reply.createdAt) >= start30d
  ).length;

  const enabledSchedules = scheduleRows.filter((schedule) => schedule.enabled);
  const scheduler = getSchedulerSnapshot();
  const runtimeScheduleCount = scheduler.runtimeRegisteredScheduleIds.filter((scheduleId) =>
    scheduleIdSet.has(scheduleId)
  ).length;
  const end30d = endOfDay(new Date());
  const expectedSlots30d = enabledSchedules.reduce(
    (sum, schedule) => sum + getCronOccurrences(schedule.cron, start30d, end30d, 300).length,
    0
  );
  const successfulSlots30d = recent30dRuns.filter((run) => run.status === "completed").length;

  return {
    publishedPieces30d,
    deliveryCount30d,
    failureCount30d,
    replyCount30d,
    consistencyScore30d: percent(successfulSlots30d, expectedSlots30d),
    completionRate30d: percent(
      recent30dRuns.filter((run) => run.status === "completed").length,
      recent30dRuns.length
    ),
    streakDays: getStreakDays(runRows),
    enabledPlatformCount: platformRows.filter((platform) => platform.enabled).length,
    activeScheduleCount: enabledSchedules.length,
    runtimeScheduleCount,
    scheduleRuntimeDrift: enabledSchedules.length - runtimeScheduleCount,
    lastPublishedAt:
      runRows.find((run) => run.status === "completed" || run.publish.publishedPlatforms.length > 0)?.startedAt ??
      null,
    timeseries: buildTimeseries(runRows),
    scheduleInsights: buildScheduleInsights(scheduleRows, runRows, platformRows),
    platformInsights: buildPlatformInsights(platformRows, scheduleRows, runRows),
    recentRuns: runRows.slice(0, 10).map((run) => ({
      ...run,
      scheduleName: scheduleRows.find((schedule) => schedule.id === run.scheduleId)?.name ?? null,
    })),
    recentPosts: postRows.slice(0, 8),
    recentReplies: replyRows,
  };
}

export async function getCalendarInsights(
  monthValue: string,
  workspaceId: string
): Promise<CalendarInsights> {
  const [year, month] = monthValue.split("-").map((value) => Number.parseInt(value, 10));
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const { scheduleRows, scheduleIdSet, postIdSet } =
    await getDashboardWorkspaceScope(workspaceId);
  const scheduleIds = scheduleRows.map((schedule) => schedule.id);
  const postIds = Array.from(postIdSet);

  const enabledScheduleRows = scheduleRows.filter((schedule) => schedule.enabled);
  const allRunRows = await getScopedRunRows({
    workspaceId,
    scheduleIds,
    postIds,
    startedAtGte: monthStart,
    startedAtLt: monthEnd,
  });
  const runRowsRaw = allRunRows.filter((run) =>
    runTargetsWorkspace(run, workspaceId, scheduleIdSet, postIdSet)
  );

  const events: CalendarEvent[] = [];
  const scheduleMap = new Map(enabledScheduleRows.map((schedule) => [schedule.id, schedule]));

  for (const schedule of enabledScheduleRows) {
    const occurrences = getCronOccurrences(schedule.cron, monthStart, monthEnd, 120);
    for (const at of occurrences) {
      events.push({
        id: `${schedule.id}-${at.toISOString()}`,
        dayKey: dayKey(at),
        at,
        label: schedule.name,
        tone: "planned",
        kind: "schedule",
      });
    }
  }

  for (const run of runRowsRaw) {
    const status = resolvePipelineRunStatus(run);
    const schedule = run.scheduleId ? scheduleMap.get(run.scheduleId) : null;
    events.push({
      id: run.id,
      dayKey: dayKey(new Date(run.startedAt)),
      at: new Date(run.startedAt),
      label: schedule?.name ?? "Manual run",
      tone: status === "completed" ? "completed" : status === "failed" ? "failed" : "running",
      kind: "run",
    });
  }

  const eventsByDay = events
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
      accumulator[event.dayKey] ||= [];
      accumulator[event.dayKey].push(event);
      return accumulator;
    }, {});

  return {
    monthLabel: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    monthStart,
    monthEnd,
    eventsByDay,
  };
}
