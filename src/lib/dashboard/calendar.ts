import { db } from "@/db";
import {
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  schedules,
} from "@/db/schema";
import {
  loadAgentPersonaScheduleContext,
  renderAgentPersonaScheduleContent,
  type AgentPersonaScheduleContext,
} from "@/lib/pipeline/agent-persona-updates";
import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getCronOccurrences } from "./cron";
import { getPlatformMeta, normalizePlatformType } from "./platforms";
import { getZonedDateParts } from "@/lib/timezone";
import { getPostCategoryMeta } from "@/lib/post-categories";
import { deriveCalendarRunDetails } from "./calendar-run-details";
import {
  isCalendarVisibleRun,
  isCalendarVisibleSchedule,
} from "./calendar-visibility";
import { getDashboardCandidates } from "./candidates";
import { resolveDynamicSchedulePreview } from "./calendar-schedule-preview";
import { getWorkspaceRssSettings, type RssSettingsConfig } from "@/lib/rss-config";
import {
  getDashboardWorkspaceScope,
  runTargetsWorkspace,
} from "./workspace-scope";

type ScheduleRow = typeof schedules.$inferSelect;
type PlatformRow = typeof platforms.$inferSelect;
type PostRow = typeof posts.$inferSelect;
type PostTargetRow = typeof postTargets.$inferSelect;

export type CalendarEventTone = "planned" | "completed" | "failed" | "running" | "blocked";

export type CalendarMediaBadge = {
  code: "T" | "I" | "V";
  label: string;
};

export type CalendarPlatformBadge = {
  id: string;
  type: string;
  label: string;
  shortLabel: string;
  accent: string;
  tooltip: string;
  formatCode: "P" | "S" | "R" | "C" | "L" | "T" | null;
  status: "planned" | "success" | "failed" | "skipped" | "running";
  handle: string | null;
  content: string | null;
  mediaUrl: string | null;
  contentType: "text" | "image" | "video" | "avatar_video" | null;
  publishedUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  firstComment: string | null;
  error: string | null;
};

export type CalendarEventDebug = {
  eventId: string;
  runId: string | null;
  scheduleId: string | null;
  postId: string | null;
  attemptCount: number;
  forecast: boolean;
  sourceUrl: string | null;
  sourceHost: string | null;
  imageUrl: string | null;
};

export type CalendarEvent = {
  id: string;
  dayKey: string;
  at: Date;
  label: string;
  preview: string | null;
  content: string | null;
  mediaUrl: string | null;
  error: string | null;
  tone: CalendarEventTone;
  kind: "schedule" | "run" | "post";
  href: string | null;
  tooltip: string;
  platforms: CalendarPlatformBadge[];
  media: CalendarMediaBadge[];
  tags: string[];
  debug: CalendarEventDebug;
};

export type CalendarInsights = {
  monthLabel: string;
  monthStart: Date;
  monthEnd: Date;
  eventsByDay: Record<string, CalendarEvent[]>;
};

function dayKey(date: Date) {
  const parts = getZonedDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value: string | null | undefined, max = 120) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function getUrlHost(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function readTagsFromMetadata(value: Record<string, unknown> | null | undefined) {
  const source = value ?? {};
  const tags = new Set<string>();

  const push = (item: string | null | undefined) => {
    const trimmed = normalizeText(item);
    if (trimmed) tags.add(trimmed);
  };

  const metadataTags = source.tags;
  if (Array.isArray(metadataTags)) {
    for (const item of metadataTags) {
      if (typeof item === "string") push(item);
    }
  }

  if (typeof source.contentCategory === "string") {
    push(getPostCategoryMeta(source.contentCategory)?.label ?? source.contentCategory);
  }

  return Array.from(tags);
}

function getRunFailureReason(run: typeof pipelineRuns.$inferSelect) {
  if (normalizeText(run.error)) return run.error ?? null;

  for (const step of run.steps ?? []) {
    const output =
      step.output && typeof step.output === "object"
        ? (step.output as Record<string, unknown>)
        : null;

    if (Array.isArray(output?.errors)) {
      const first = output.errors[0];
      if (typeof first === "string" && normalizeText(first)) return first;
      if (
        first &&
        typeof first === "object" &&
        typeof (first as Record<string, unknown>).error === "string"
      ) {
        const value = String((first as Record<string, unknown>).error).trim();
        if (value) return value;
      }
    }

    if (normalizeText(step.error)) return step.error ?? null;
  }

  return null;
}

function getMediaBadges(contentType: string | null | undefined, hasText: boolean) {
  if (contentType === "image") {
    return [
      { code: "I", label: "Image" },
      ...(hasText ? [{ code: "T", label: "Text" } as const] : []),
    ] satisfies CalendarMediaBadge[];
  }

  if (contentType === "video" || contentType === "avatar_video") {
    return [
      { code: "V", label: contentType === "avatar_video" ? "Avatar Video" : "Video" },
      ...(hasText ? [{ code: "T", label: "Text" } as const] : []),
    ] satisfies CalendarMediaBadge[];
  }

  return [{ code: "T", label: "Text" }] satisfies CalendarMediaBadge[];
}

function getScheduleMediaBadges(schedule: ScheduleRow, preview: string | null) {
  if (schedule.jobType === "avatar_video") {
    return getMediaBadges("avatar_video", Boolean(preview));
  }

  if (schedule.jobType === "image_post") {
    return getMediaBadges("image", Boolean(preview));
  }

  return getMediaBadges("text", Boolean(preview));
}

function getPlatformKey(type: string | null | undefined) {
  return normalizePlatformType(type) === "x" ? "twitter" : normalizePlatformType(type);
}

function readThreadLongPosts(platform: PlatformRow | null | undefined) {
  const value = platform?.config?.credentials;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean((value as Record<string, unknown>).threadLongPosts);
}

function inferFormatCodeForContent(
  platform: PlatformRow | null | undefined,
  content: string | null | undefined,
  contentType: string | null | undefined,
  explicitInstagramType: "story" | "reel" | null = null
): CalendarPlatformBadge["formatCode"] {
  const normalized = normalizePlatformType(platform?.type);

  if (normalized === "instagram") {
    if (explicitInstagramType === "story") return "S";
    if (explicitInstagramType === "reel") return "R";
    if (contentType === "video" || contentType === "avatar_video") return "R";
    if (contentType === "image") return "P";
    return null;
  }

  if (normalized === "x") {
    const text = normalizeText(content);
    if (text.length > 280) {
      return readThreadLongPosts(platform) ? "T" : "L";
    }
  }

  return null;
}

function getFormatLabel(code: CalendarPlatformBadge["formatCode"]) {
  if (code === "P") return "Post";
  if (code === "S") return "Story";
  if (code === "R") return "Reel";
  if (code === "C") return "Carousel";
  if (code === "L") return "Long Post";
  if (code === "T") return "Thread";
  return null;
}

function getPlatformStatusLabel(status: CalendarPlatformBadge["status"]) {
  if (status === "success") return "Posted";
  if (status === "failed") return "Failed";
  if (status === "skipped") return "Skipped";
  if (status === "running") return "Running";
  return "Scheduled";
}

function buildPlatformBadge(
  platform: PlatformRow | null | undefined,
  options: {
    content?: string | null;
    contentType?: string | null;
    explicitInstagramType?: "story" | "reel" | null;
    media?: CalendarMediaBadge[];
    fallbackType?: string | null;
    fallbackId?: string;
    status?: CalendarPlatformBadge["status"];
    mediaUrl?: string | null;
    publishedUrl?: string | null;
    sourceUrl?: string | null;
    firstComment?: string | null;
    error?: string | null;
  }
): CalendarPlatformBadge {
  const type = platform?.type ?? options.fallbackType ?? "unknown";
  const meta = getPlatformMeta(type);
  const formatCode = inferFormatCodeForContent(
    platform,
    options.content,
    options.contentType,
    options.explicitInstagramType ?? null
  );
  const formatLabel = getFormatLabel(formatCode);
  const mediaLabel = (options.media ?? []).map((item) => item.label).join(" + ");
  const tooltipParts = [
    platform?.handle ? `${meta.label} ${platform.handle}` : platform?.name ?? meta.label,
    getPlatformStatusLabel(options.status ?? "planned"),
    formatLabel,
    mediaLabel || null,
  ].filter(Boolean);

  const normalizedContentType = (() => {
    const value = options.contentType;
    if (
      value === "text" ||
      value === "image" ||
      value === "video" ||
      value === "avatar_video"
    ) {
      return value;
    }
    return null;
  })();

  const inferredFirstComment =
    options.sourceUrl && normalizePlatformType(type) === "x"
      ? `Source: ${options.sourceUrl}`
      : null;

  return {
    id: platform?.id ?? options.fallbackId ?? `${type}-${meta.shortLabel}`,
    type: normalizePlatformType(type),
    label: meta.label,
    shortLabel: meta.shortLabel,
    accent: meta.accent,
    tooltip: tooltipParts.join(" • "),
    formatCode,
    status: options.status ?? "planned",
    handle: platform?.handle ?? null,
    content: normalizeText(options.content) ? options.content ?? null : null,
    mediaUrl: options.mediaUrl ?? null,
    contentType: normalizedContentType,
    publishedUrl: options.publishedUrl ?? null,
    sourceUrl: options.sourceUrl ?? null,
    sourceHost: getUrlHost(options.sourceUrl ?? null),
    firstComment: options.firstComment ?? inferredFirstComment,
    error: options.error ?? null,
  };
}

function buildEventTooltip(event: Omit<CalendarEvent, "tooltip">) {
  const lines = [event.label];

  if (event.platforms.length > 0) {
    lines.push(event.platforms.map((platform) => platform.tooltip).join(" | "));
  }

  if (event.media.length > 0) {
    lines.push(event.media.map((media) => media.label).join(" + "));
  }

  if (event.tags.length > 0) {
    lines.push(event.tags.join(" • "));
  }

  if (event.preview) {
    lines.push(event.preview);
  }

  if (event.content && event.content !== event.preview) {
    lines.push(event.content);
  }

  return lines.join("\n");
}

function pushCalendarEvent(
  events: CalendarEvent[],
  baseEvent: Omit<CalendarEvent, "id" | "tooltip"> & { id: string }
) {
  const candidateEvent: CalendarEvent = {
    ...baseEvent,
    tooltip: buildEventTooltip(baseEvent),
  };
  const existingIndex = events.findIndex((event) => shouldMergeCalendarEvent(event, candidateEvent));
  if (existingIndex === -1) {
    events.push(candidateEvent);
    return;
  }

  events[existingIndex] = mergeCalendarEvents(events[existingIndex], candidateEvent);
}

function shouldMergeCalendarEvent(left: CalendarEvent, right: CalendarEvent) {
  if (left.dayKey !== right.dayKey) return false;
  if (!left.debug.scheduleId || !right.debug.scheduleId) return false;
  if (left.debug.scheduleId !== right.debug.scheduleId) return false;

  if (left.kind === "run" && right.kind === "run") {
    if (left.debug.postId || right.debug.postId) return false;
    if (left.label !== right.label) return false;
    return (left.debug.sourceUrl ?? null) === (right.debug.sourceUrl ?? null);
  }

  if (left.kind === "post" && right.kind === "post") {
    if ((left.debug.sourceUrl ?? null) !== (right.debug.sourceUrl ?? null)) return false;
    return sameMinute(left.at, right.at);
  }

  return false;
}

function sameMinute(left: Date, right: Date) {
  const leftMinute = new Date(left);
  leftMinute.setSeconds(0, 0);
  const rightMinute = new Date(right);
  rightMinute.setSeconds(0, 0);
  return leftMinute.getTime() === rightMinute.getTime();
}

function mergePlatformStatus(
  left: CalendarPlatformBadge["status"],
  right: CalendarPlatformBadge["status"]
): CalendarPlatformBadge["status"] {
  const rank = {
    planned: 0,
    skipped: 1,
    failed: 2,
    running: 3,
    success: 4,
  } satisfies Record<CalendarPlatformBadge["status"], number>;

  return rank[left] >= rank[right] ? left : right;
}

function resolveMergedTone(platforms: CalendarPlatformBadge[], fallback: CalendarEventTone) {
  if (platforms.some((platform) => platform.status === "running")) return "running";
  const actionable = platforms.filter((platform) => platform.status !== "planned");
  if (actionable.length === 0) return fallback;
  if (actionable.every((platform) => platform.status === "success" || platform.status === "skipped")) {
    return "completed";
  }
  return "failed";
}

function mergeCalendarEvents(left: CalendarEvent, right: CalendarEvent): CalendarEvent {
  const primary = left.at.getTime() >= right.at.getTime() ? left : right;
  const secondary = primary === left ? right : left;
  const platforms = new Map<string, CalendarPlatformBadge>();

  for (const platform of [...secondary.platforms, ...primary.platforms]) {
    const existing = platforms.get(platform.type);
    if (!existing) {
      platforms.set(platform.type, platform);
      continue;
    }
    const nextStatus = mergePlatformStatus(existing.status, platform.status);
    const prefersIncoming =
      nextStatus !== existing.status || primary.platforms.includes(platform);
    platforms.set(platform.type, {
      ...existing,
      status: nextStatus,
      tooltip: prefersIncoming ? platform.tooltip : existing.tooltip,
      content: prefersIncoming ? platform.content ?? existing.content : existing.content ?? platform.content,
      mediaUrl: prefersIncoming ? platform.mediaUrl ?? existing.mediaUrl : existing.mediaUrl ?? platform.mediaUrl,
      contentType: prefersIncoming ? platform.contentType ?? existing.contentType : existing.contentType ?? platform.contentType,
      publishedUrl: prefersIncoming ? platform.publishedUrl ?? existing.publishedUrl : existing.publishedUrl ?? platform.publishedUrl,
      sourceUrl: prefersIncoming ? platform.sourceUrl ?? existing.sourceUrl : existing.sourceUrl ?? platform.sourceUrl,
      sourceHost: prefersIncoming ? platform.sourceHost ?? existing.sourceHost : existing.sourceHost ?? platform.sourceHost,
      firstComment: prefersIncoming ? platform.firstComment ?? existing.firstComment : existing.firstComment ?? platform.firstComment,
      error: prefersIncoming ? platform.error ?? existing.error : existing.error ?? platform.error,
      handle: prefersIncoming ? platform.handle ?? existing.handle : existing.handle ?? platform.handle,
    });
  }

  const merged: CalendarEvent = {
    ...primary,
    error: primary.error ?? secondary.error,
    platforms: Array.from(platforms.values()),
    tone: resolveMergedTone(Array.from(platforms.values()), primary.tone),
    debug: {
      ...primary.debug,
      attemptCount: left.debug.attemptCount + right.debug.attemptCount,
    },
  };

  return {
    ...merged,
    tooltip: buildEventTooltip(merged),
  };
}

function firstPlatformPreview(
  fixedContent: ReturnType<typeof resolveFixedScheduleContent>,
  targetPlatforms: PlatformRow[]
) {
  if (!fixedContent) return null;

  for (const platform of targetPlatforms) {
    const value = fixedContent.contentByPlatform[getPlatformKey(platform.type)];
    const shortened = shorten(value, 140);
    if (shortened) return shortened;
  }

  return shorten(fixedContent.summary, 140);
}

function firstPlatformMediaUrl(
  fixedContent: ReturnType<typeof resolveFixedScheduleContent>,
  targetPlatforms: PlatformRow[]
) {
  if (!fixedContent) return null;

  for (const platform of targetPlatforms) {
    const value = fixedContent.mediaUrlByPlatform[getPlatformKey(platform.type)];
    if (value) return value;
  }

  return null;
}

function getScheduleTags(schedule: ScheduleRow) {
  const config = schedule.config ?? {};
  const tags = new Set<string>();

  const contentCategory =
    typeof config.contentCategory === "string" ? config.contentCategory : null;

  if (contentCategory) {
    tags.add(getPostCategoryMeta(contentCategory)?.label ?? contentCategory);
  }

  return Array.from(tags);
}

function getPostTags(post: PostRow | null | undefined) {
  if (!post?.metadata) return [];
  return readTagsFromMetadata(post.metadata);
}

function readSourceScheduleId(post: PostRow | null | undefined) {
  return typeof post?.metadata?.sourceScheduleId === "string"
    ? post.metadata.sourceScheduleId
    : null;
}

function getScheduleContentType(schedule: ScheduleRow) {
  if (schedule.jobType === "avatar_video") return "avatar_video";
  if (schedule.jobType === "image_post") return "image";
  return "text";
}

function getTargetPlatformsForSchedule(
  schedule: ScheduleRow | null | undefined,
  platformMap: Map<string, PlatformRow>
) {
  if (!schedule) return [];

  return (schedule.targetPlatformIds ?? [])
    .map((platformId) => platformMap.get(platformId))
    .filter((platform): platform is PlatformRow => Boolean(platform));
}

async function buildSchedulePresentation(
  schedule: ScheduleRow,
  targetPlatforms: PlatformRow[],
  priorRunCount: number,
  at: Date,
  candidatePool: Awaited<ReturnType<typeof getDashboardCandidates>>,
  rssSettings: RssSettingsConfig,
  agentPersonaContextPromise: Promise<AgentPersonaScheduleContext | null>
) {
  const platformTypes = targetPlatforms.map((platform) => platform.type);
  const agentPersonaContext = await agentPersonaContextPromise;
  const fixedContent =
    agentPersonaContext
      ? await renderAgentPersonaScheduleContent(agentPersonaContext, platformTypes, at)
      : resolveFixedScheduleContent(
          schedule.config,
          platformTypes,
          priorRunCount,
          at
        );
  const dynamicPreview =
    fixedContent
      ? null
      : resolveDynamicSchedulePreview(
          schedule,
          candidatePool,
          priorRunCount,
          platformTypes,
          {
            xTemplate: rssSettings.xTemplate,
            linkedinTemplate: rssSettings.linkedinTemplate,
            transformationPrompt: rssSettings.transformationPrompt,
          }
        );
  const preview =
    firstPlatformPreview(fixedContent, targetPlatforms) ??
    dynamicPreview?.preview ??
    null;
  const contentType = dynamicPreview?.contentType ?? getScheduleContentType(schedule);
  const media =
    dynamicPreview
      ? getMediaBadges(contentType, Boolean(dynamicPreview.content))
      : getScheduleMediaBadges(schedule, preview);
  const platforms = targetPlatforms.map((platform) => {
    const platformKey = getPlatformKey(platform.type);
    const perPlatformContent =
      fixedContent?.contentByPlatform[platformKey] ??
      dynamicPreview?.contentByPlatform[platformKey] ??
      dynamicPreview?.content ??
      dynamicPreview?.preview ??
      dynamicPreview?.label ??
      preview;
    const perPlatformMediaUrl =
      fixedContent?.mediaUrlByPlatform[platformKey] ??
      dynamicPreview?.mediaUrl ??
      null;
    return buildPlatformBadge(platform, {
      content: perPlatformContent,
      contentType,
      explicitInstagramType:
        fixedContent?.instagramContentTypeByPlatform[platformKey] ?? null,
      media,
      status: schedule.enabled ? "planned" : "skipped",
      mediaUrl: perPlatformMediaUrl,
      sourceUrl: dynamicPreview?.sourceUrl ?? null,
      firstComment: dynamicPreview?.firstCommentByPlatform[platformKey] ?? null,
    });
  });

  return {
    label: fixedContent?.title ?? dynamicPreview?.label ?? schedule.name,
    preview,
    content: fixedContent
      ? targetPlatforms
          .map((platform) => fixedContent.contentByPlatform[getPlatformKey(platform.type)])
          .find((value) => normalizeText(value)) ?? fixedContent.summary
      : dynamicPreview
        ? dynamicPreview.content
      : schedule.description ?? null,
    mediaUrl:
      firstPlatformMediaUrl(fixedContent, targetPlatforms) ??
      dynamicPreview?.mediaUrl ??
      null,
    media,
    platforms,
    debug: {
      forecast: Boolean(dynamicPreview?.forecast),
      sourceUrl: dynamicPreview?.sourceUrl ?? null,
      sourceHost: dynamicPreview?.sourceHost ?? null,
      imageUrl:
        firstPlatformMediaUrl(fixedContent, targetPlatforms) ??
        dynamicPreview?.mediaUrl ??
        null,
    },
  };
}

export async function getCalendarInsights(
  monthValue: string,
  workspaceId: string
): Promise<CalendarInsights> {
  const [year, month] = monthValue.split("-").map((value) => Number.parseInt(value, 10));
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const {
    platformRows,
    platformIds,
    scheduleRows,
    scheduleIdSet,
    postIds,
    postIdSet,
  } = await getDashboardWorkspaceScope(workspaceId);
  const scheduleMap = new Map(scheduleRows.map((schedule) => [schedule.id, schedule]));
  const calendarScheduleRows = scheduleRows.filter(isCalendarVisibleSchedule);
  const calendarScheduleIds = calendarScheduleRows.map((schedule) => schedule.id);
  const [candidatePool, rssSettings] = await Promise.all([
    getDashboardCandidates(24, workspaceId),
    getWorkspaceRssSettings(workspaceId),
  ]);
  const agentPersonaContextByScheduleId = new Map<
    string,
    Promise<AgentPersonaScheduleContext | null>
  >();

  const [allRunRows, scheduledPostRows, priorRunRows] = await Promise.all([
    db
      .select()
      .from(pipelineRuns)
      .where(
        and(
          eq(pipelineRuns.workspaceId, workspaceId),
          gte(pipelineRuns.startedAt, monthStart),
          lt(pipelineRuns.startedAt, monthEnd)
        )
      )
      .orderBy(desc(pipelineRuns.startedAt)),
    postIds.length > 0
      ? db
          .select()
          .from(posts)
          .where(
            and(
              inArray(posts.id, postIds),
              gte(posts.scheduledAt, monthStart),
              lt(posts.scheduledAt, monthEnd),
              inArray(posts.status, ["scheduled", "publishing"])
            )
          )
          .orderBy(desc(posts.scheduledAt))
      : Promise.resolve([] as PostRow[]),
    calendarScheduleIds.length > 0
      ? db
          .select({ scheduleId: pipelineRuns.scheduleId })
          .from(pipelineRuns)
          .where(
            and(
              eq(pipelineRuns.workspaceId, workspaceId),
              inArray(pipelineRuns.scheduleId, calendarScheduleIds),
              lt(pipelineRuns.startedAt, monthStart)
            )
          )
      : Promise.resolve([] as Array<{ scheduleId: string | null }>),
  ]);
  const runRowsRaw = allRunRows
    .filter((run) => runTargetsWorkspace(run, workspaceId, scheduleIdSet, postIdSet))
    .filter((run) => isCalendarVisibleRun(run, scheduleMap));

  const publishedPostRows =
    postIds.length > 0
      ? await db
          .select()
          .from(posts)
          .where(
            and(
              inArray(posts.id, postIds),
              gte(posts.publishedAt, monthStart),
              lt(posts.publishedAt, monthEnd),
              inArray(posts.status, ["published", "partial_failure"])
            )
          )
          .orderBy(desc(posts.publishedAt))
      : [];

  const relatedPostIds = Array.from(
    new Set(
      [
        ...scheduledPostRows.map((post) => post.id),
        ...publishedPostRows.map((post) => post.id),
        ...runRowsRaw
          .map((run) => run.postId)
          .filter((postId): postId is string => Boolean(postId)),
      ]
    )
  );

  const [targetRows, relatedPostRows] = await Promise.all([
    relatedPostIds.length > 0
      ? db
          .select()
          .from(postTargets)
          .where(
            and(
              inArray(postTargets.postId, relatedPostIds),
              inArray(postTargets.platformId, platformIds)
            )
          )
      : Promise.resolve([] as PostTargetRow[]),
    relatedPostIds.length > 0
      ? db.select().from(posts).where(inArray(posts.id, relatedPostIds))
      : Promise.resolve([] as PostRow[]),
  ]);

  const platformMap = new Map(platformRows.map((platform) => [platform.id, platform]));
  const postMap = new Map(relatedPostRows.map((post) => [post.id, post]));
  const now = new Date();
  const priorRunCountsByScheduleId = priorRunRows.reduce<Map<string, number>>(
    (accumulator, run) => {
      if (!run.scheduleId) return accumulator;
      accumulator.set(run.scheduleId, (accumulator.get(run.scheduleId) ?? 0) + 1);
      return accumulator;
    },
    new Map()
  );
  const priorRunCountByRunId = [...runRowsRaw]
    .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())
    .reduce<Map<string, number>>((accumulator, run) => {
      if (!run.scheduleId) return accumulator;
      const count = priorRunCountsByScheduleId.get(run.scheduleId) ?? 0;
      accumulator.set(run.id, count);
      priorRunCountsByScheduleId.set(run.scheduleId, count + 1);
      return accumulator;
    }, new Map());
  const targetsByPostId = targetRows.reduce<Map<string, PostTargetRow[]>>((accumulator, target) => {
    const existing = accumulator.get(target.postId) ?? [];
    existing.push(target);
    accumulator.set(target.postId, existing);
    return accumulator;
  }, new Map());
  const handledScheduleSlots = new Set<string>();

  for (const run of runRowsRaw) {
    if (!run.scheduleId) continue;
    handledScheduleSlots.add(`${run.scheduleId}:${dayKey(new Date(run.startedAt))}`);
  }

  for (const post of [...scheduledPostRows, ...publishedPostRows]) {
    const sourceScheduleId = readSourceScheduleId(post);
    const at = post.scheduledAt ?? post.publishedAt;
    if (!sourceScheduleId || !at) continue;
    handledScheduleSlots.add(`${sourceScheduleId}:${dayKey(new Date(at))}`);
  }

  const events: CalendarEvent[] = [];

  const getAgentPersonaContext = (schedule: ScheduleRow) => {
    const existing = agentPersonaContextByScheduleId.get(schedule.id);
    if (existing) return existing;

    const created = loadAgentPersonaScheduleContext(schedule.config);
    agentPersonaContextByScheduleId.set(schedule.id, created);
    return created;
  };

  for (const schedule of calendarScheduleRows) {
    const targetPlatforms = getTargetPlatformsForSchedule(schedule, platformMap);
    const occurrences = getCronOccurrences(schedule.cron, monthStart, monthEnd, 120);

    for (const [index, at] of occurrences.entries()) {
      if (at.getTime() < now.getTime()) {
        continue;
      }

      if (handledScheduleSlots.has(`${schedule.id}:${dayKey(at)}`)) {
        continue;
      }

      const presentation = await buildSchedulePresentation(
        schedule,
        targetPlatforms,
        index,
        at,
        candidatePool,
        rssSettings,
        getAgentPersonaContext(schedule)
      );

      const baseEvent = {
        id: `${schedule.id}-${at.toISOString()}`,
        dayKey: dayKey(at),
        at,
        label: presentation.label,
        preview: presentation.preview,
        content: presentation.content,
        mediaUrl: presentation.mediaUrl,
        tone: schedule.enabled ? ("planned" as const) : ("blocked" as const),
        kind: "schedule" as const,
        href: `/dashboard/schedules/${schedule.id}`,
        error: null,
        platforms: presentation.platforms,
        media: presentation.media,
        tags: getScheduleTags(schedule),
        debug: {
          eventId: `${schedule.id}-${at.toISOString()}`,
          runId: null,
          scheduleId: schedule.id,
          postId: null,
          attemptCount: 1,
          forecast: presentation.debug.forecast,
          sourceUrl: presentation.debug.sourceUrl,
          sourceHost: presentation.debug.sourceHost,
          imageUrl: presentation.debug.imageUrl,
        },
      };

      pushCalendarEvent(events, baseEvent);
    }
  }

  for (const post of scheduledPostRows) {
    if (!post.scheduledAt) continue;

    const media = getMediaBadges(post.contentType, Boolean(normalizeText(post.content)));
    const platformsForEvent = (targetsByPostId.get(post.id) ?? [])
      .map((target) => ({ target, platform: platformMap.get(target.platformId) }))
      .filter(
        (entry): entry is { target: PostTargetRow; platform: PlatformRow } =>
          Boolean(entry.platform)
      )
      .map(({ target, platform }) =>
        buildPlatformBadge(platform, {
          content: post.content,
          contentType: post.contentType,
          media,
          status:
            target.status === "published"
              ? "success"
              : target.status === "failed"
                ? "failed"
                : target.status === "publishing"
                  ? "running"
                  : target.status === "skipped"
                    ? "skipped"
                    : post.status === "publishing"
                      ? "running"
                      : "planned",
          mediaUrl: post.mediaUrl ?? null,
          publishedUrl: target.publishedUrl ?? null,
          sourceUrl: post.sourceUrl ?? null,
          error: target.error ?? null,
        })
      );

    const baseEvent = {
      id: post.id,
      dayKey: dayKey(post.scheduledAt),
      at: new Date(post.scheduledAt),
      label: post.title || "Scheduled post",
      preview: shorten(post.content, 140),
      content: post.content,
      mediaUrl: post.mediaUrl,
      tone: post.status === "publishing" ? ("running" as const) : ("planned" as const),
      kind: "post" as const,
      href: `/dashboard/posts/${post.id}`,
      error: null,
      platforms: platformsForEvent,
      media,
      tags: getPostTags(post),
      debug: {
        eventId: post.id,
        runId: null,
        scheduleId: readSourceScheduleId(post),
        postId: post.id,
        attemptCount: 1,
        forecast: false,
        sourceUrl: post.sourceUrl ?? null,
        sourceHost: getUrlHost(post.sourceUrl),
        imageUrl: post.mediaUrl ?? null,
      },
    };

    pushCalendarEvent(events, baseEvent);
  }

  for (const post of publishedPostRows) {
    if (!post.publishedAt) continue;

    const media = getMediaBadges(post.contentType, Boolean(normalizeText(post.content)));
    const platformsForEvent = (targetsByPostId.get(post.id) ?? [])
      .map((target) => ({ target, platform: platformMap.get(target.platformId) }))
      .filter(
        (entry): entry is { target: PostTargetRow; platform: PlatformRow } =>
          Boolean(entry.platform)
      )
      .map(({ target, platform }) =>
        buildPlatformBadge(platform, {
          content: post.content,
          contentType: post.contentType,
          media,
          status:
            target.status === "published"
              ? "success"
              : target.status === "failed"
                ? "failed"
                : target.status === "publishing"
                  ? "running"
                  : target.status === "skipped"
                    ? "skipped"
                    : "planned",
          mediaUrl: post.mediaUrl ?? null,
          publishedUrl: target.publishedUrl ?? null,
          sourceUrl: post.sourceUrl ?? null,
          error: target.error ?? null,
        })
      );

    const baseEvent = {
      id: `${post.id}-published`,
      dayKey: dayKey(post.publishedAt),
      at: new Date(post.publishedAt),
      label: post.title || "Published post",
      preview: shorten(post.content, 140),
      content: post.content,
      mediaUrl: post.mediaUrl,
      tone: "completed" as const,
      kind: "post" as const,
      href: `/dashboard/posts/${post.id}`,
      error: null,
      platforms: platformsForEvent,
      media,
      tags: getPostTags(post),
      debug: {
        eventId: `${post.id}-published`,
        runId: null,
        scheduleId: readSourceScheduleId(post),
        postId: post.id,
        attemptCount: 1,
        forecast: false,
        sourceUrl: post.sourceUrl ?? null,
        sourceHost: getUrlHost(post.sourceUrl),
        imageUrl: post.mediaUrl ?? null,
      },
    };

    pushCalendarEvent(events, baseEvent);
  }

  // Post IDs already represented on the calendar from the scheduled/published queries
  const renderedPostIds = new Set([
    ...scheduledPostRows.map((post) => post.id),
    ...publishedPostRows.map((post) => post.id),
  ]);

  for (const run of runRowsRaw) {
    // Only skip runs whose linked post is already rendered as its own calendar event.
    // Failed posts don't appear in scheduledPostRows/publishedPostRows, so the run
    // must represent them instead.
    if (run.postId && renderedPostIds.has(run.postId)) {
      continue;
    }

    const status = resolvePipelineRunStatus(run);
    const runPost = run.postId ? postMap.get(run.postId) ?? null : null;
    const schedule = run.scheduleId ? scheduleMap.get(run.scheduleId) ?? null : null;
    const targetPlatforms = getTargetPlatformsForSchedule(schedule, platformMap);
    const schedulePresentation = schedule
      ? await buildSchedulePresentation(
          schedule,
          targetPlatforms,
          priorRunCountByRunId.get(run.id) ?? 0,
          new Date(run.startedAt),
          candidatePool,
          rssSettings,
          getAgentPersonaContext(schedule)
        )
      : null;
    const runDetails = deriveCalendarRunDetails(run, targetPlatforms);
    const content = runPost?.content
      || runDetails.content
      || runDetails.summary
      || schedulePresentation?.content
      || schedule?.description
      || null;
    const mediaUrl = runPost?.mediaUrl ?? runDetails.mediaUrl ?? schedulePresentation?.mediaUrl ?? null;
    const actualContentType = runPost?.contentType
      ?? runDetails.contentType
      ?? (runPost?.mediaUrl || runDetails.mediaUrl
        ? schedule?.jobType === "avatar_video"
          ? "avatar_video"
          : "image"
        : null);
    const contentType = actualContentType
      ?? (schedule
        ? getScheduleContentType(schedule)
        : "text");
    const media = runPost
      ? getMediaBadges(runPost.contentType, Boolean(normalizeText(runPost.content)))
      : runDetails.platforms.length > 0 || runDetails.content || runDetails.mediaUrl
        ? getMediaBadges(actualContentType ?? "text", Boolean(normalizeText(content)))
        : schedulePresentation?.media ?? [];
    const runPostPlatforms = runPost
      ? (targetsByPostId.get(runPost.id) ?? [])
          .map((target) => platformMap.get(target.platformId))
          .filter((platform): platform is PlatformRow => Boolean(platform))
      : [];
    const runDetailsByPlatformType = new Map(
      runDetails.platforms.map((platform) => [normalizePlatformType(platform.type), platform])
    );
    const runSourceUrl = runDetails.sourceUrl ?? runPost?.sourceUrl ?? null;
    const runPostTargetByPlatformType = runPost
      ? new Map(
          (targetsByPostId.get(runPost.id) ?? []).map((target) => {
            const platform = platformMap.get(target.platformId);
            return [normalizePlatformType(platform?.type ?? null), target] as const;
          })
        )
      : new Map<string, PostTargetRow>();
    const derivedPlatforms = runDetails.platforms.map((item) =>
      buildPlatformBadge(
        targetPlatforms.find(
          (platform) => normalizePlatformType(platform.type) === normalizePlatformType(item.type)
        ),
        {
          content: item.content,
          contentType: item.contentType ?? contentType,
          explicitInstagramType: item.explicitInstagramType,
          media,
          fallbackType: item.type,
          status:
            item.publishStatus === "success"
              ? "success"
              : item.publishStatus === "failed"
                ? "failed"
                : item.publishStatus === "skipped"
                  ? "skipped"
                  : status === "running"
                    ? "running"
                    : "planned",
          mediaUrl: item.mediaUrl ?? runDetails.mediaUrl ?? null,
          sourceUrl: runSourceUrl,
          publishedUrl:
            runPostTargetByPlatformType.get(normalizePlatformType(item.type))?.publishedUrl ?? null,
        }
      )
    );
    const platformsForEvent =
      runPostPlatforms.length > 0
        ? runPostPlatforms.map((platform) => {
            const target = runPostTargetByPlatformType.get(
              normalizePlatformType(platform.type)
            );
            const details = runDetailsByPlatformType.get(normalizePlatformType(platform.type));
            return buildPlatformBadge(platform, {
              content: details?.content ?? runPost?.content,
              contentType: details?.contentType ?? runPost?.contentType,
              media,
              status:
                status === "completed"
                  ? "success"
                  : status === "running"
                    ? "running"
                    : "failed",
              mediaUrl: details?.mediaUrl ?? runPost?.mediaUrl ?? null,
              publishedUrl: target?.publishedUrl ?? null,
              sourceUrl: runSourceUrl ?? runPost?.sourceUrl ?? null,
              error: target?.error ?? null,
            });
          })
        : targetPlatforms.length > 0
          ? targetPlatforms.map((platform) => {
              const details = runDetailsByPlatformType.get(normalizePlatformType(platform.type));
              return buildPlatformBadge(platform, {
                content:
                  details?.content
                  ?? schedulePresentation?.content
                  ?? schedulePresentation?.preview
                  ?? content,
                contentType: details?.contentType ?? actualContentType ?? contentType,
                explicitInstagramType: details?.explicitInstagramType ?? null,
                media,
                status:
                  details?.publishStatus === "success"
                    ? "success"
                    : details?.publishStatus === "failed"
                      ? "failed"
                      : details?.publishStatus === "skipped"
                        ? "skipped"
                        : status === "running"
                          ? "running"
                          : status === "completed"
                            ? "success"
                            : "failed",
                mediaUrl: details?.mediaUrl ?? runDetails.mediaUrl ?? null,
                sourceUrl: runSourceUrl,
                publishedUrl:
                  runPostTargetByPlatformType.get(normalizePlatformType(platform.type))
                    ?.publishedUrl ?? null,
              });
            })
          : derivedPlatforms.length > 0
            ? derivedPlatforms
            : schedulePresentation?.platforms ?? [];
    const preview = runPost
      ? shorten(runPost.content, 140)
      : shorten(content, 140) ?? schedulePresentation?.preview ?? shorten(schedule?.description, 140);
    const debugSourceUrl =
      runPost?.sourceUrl ??
      runDetails.sourceUrl ??
      schedulePresentation?.debug.sourceUrl ??
      null;
    const debugImageUrl =
      runPost?.mediaUrl ??
      runDetails.mediaUrl ??
      schedulePresentation?.debug.imageUrl ??
      null;

    const baseEvent = {
      id: run.id,
      dayKey: dayKey(new Date(run.startedAt)),
      at: new Date(run.startedAt),
      label:
        runPost?.title
        || runDetails.title
        || schedulePresentation?.label
        || schedule?.name
        || "Manual run",
      preview,
      content,
      mediaUrl,
      tone: status === "completed" ? ("completed" as const) : status === "failed" ? ("failed" as const) : ("running" as const),
      kind: "run" as const,
      href: run.postId ? `/dashboard/posts/${run.postId}` : run.scheduleId ? `/dashboard/schedules/${run.scheduleId}` : null,
      error: status === "failed" ? getRunFailureReason(run) : null,
      platforms: platformsForEvent,
      media,
      tags: runPost ? getPostTags(runPost) : schedule ? getScheduleTags(schedule) : [],
      debug: {
        eventId: run.id,
        runId: run.id,
        scheduleId: run.scheduleId ?? null,
        postId: run.postId ?? null,
        attemptCount: 1,
        forecast: false,
        sourceUrl: debugSourceUrl,
        sourceHost: getUrlHost(debugSourceUrl) ?? schedulePresentation?.debug.sourceHost ?? null,
        imageUrl: debugImageUrl,
      },
    };

    pushCalendarEvent(events, baseEvent);
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
