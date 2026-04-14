import { db } from "@/db";
import {
  pipelineRuns,
  platforms,
  posts,
  postTargets,
  schedules,
} from "@/db/schema";
import { resolveFixedScheduleContent } from "@/lib/pipeline/fixed-schedule-post";
import { resolvePipelineRunStatus } from "@/lib/pipeline/status";
import { and, desc, gte, inArray, lt } from "drizzle-orm";
import { getCronOccurrences } from "./cron";
import { getPlatformMeta, normalizePlatformType } from "./platforms";
import { getZonedDateParts } from "@/lib/timezone";
import { getPostCategoryMeta } from "@/lib/post-categories";

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
};

export type CalendarEvent = {
  id: string;
  dayKey: string;
  at: Date;
  label: string;
  preview: string | null;
  content: string | null;
  mediaUrl: string | null;
  tone: CalendarEventTone;
  kind: "schedule" | "run" | "post";
  href: string | null;
  tooltip: string;
  platforms: CalendarPlatformBadge[];
  media: CalendarMediaBadge[];
  tags: string[];
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

function buildPlatformBadge(
  platform: PlatformRow | null | undefined,
  options: {
    content?: string | null;
    contentType?: string | null;
    explicitInstagramType?: "story" | "reel" | null;
    media?: CalendarMediaBadge[];
    fallbackType?: string | null;
    fallbackId?: string;
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
    formatLabel,
    mediaLabel || null,
  ].filter(Boolean);

  return {
    id: platform?.id ?? options.fallbackId ?? `${type}-${meta.shortLabel}`,
    type: normalizePlatformType(type),
    label: meta.label,
    shortLabel: meta.shortLabel,
    accent: meta.accent,
    tooltip: tooltipParts.join(" • "),
    formatCode,
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

export async function getCalendarInsights(monthValue: string): Promise<CalendarInsights> {
  const [year, month] = monthValue.split("-").map((value) => Number.parseInt(value, 10));
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);

  const [scheduleRows, runRowsRaw, platformRows, scheduledPostRows] = await Promise.all([
    db.select().from(schedules),
    db
      .select()
      .from(pipelineRuns)
      .where(and(gte(pipelineRuns.startedAt, monthStart), lt(pipelineRuns.startedAt, monthEnd)))
      .orderBy(desc(pipelineRuns.startedAt)),
    db.select().from(platforms),
    db
      .select()
      .from(posts)
      .where(
        and(
          gte(posts.scheduledAt, monthStart),
          lt(posts.scheduledAt, monthEnd),
          inArray(posts.status, ["scheduled", "publishing"])
        )
      )
      .orderBy(desc(posts.scheduledAt)),
  ]);

  const publishedPostRows = await db
    .select()
    .from(posts)
    .where(
      and(
        gte(posts.publishedAt, monthStart),
        lt(posts.publishedAt, monthEnd),
        inArray(posts.status, ["published", "partial_failure"])
      )
    )
    .orderBy(desc(posts.publishedAt));

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
      ? db.select().from(postTargets).where(inArray(postTargets.postId, relatedPostIds))
      : Promise.resolve([] as PostTargetRow[]),
    relatedPostIds.length > 0
      ? db.select().from(posts).where(inArray(posts.id, relatedPostIds))
      : Promise.resolve([] as PostRow[]),
  ]);

  const platformMap = new Map(platformRows.map((platform) => [platform.id, platform]));
  const scheduleMap = new Map(scheduleRows.map((schedule) => [schedule.id, schedule]));
  const postMap = new Map(relatedPostRows.map((post) => [post.id, post]));
  const targetsByPostId = targetRows.reduce<Map<string, PostTargetRow[]>>((accumulator, target) => {
    const existing = accumulator.get(target.postId) ?? [];
    existing.push(target);
    accumulator.set(target.postId, existing);
    return accumulator;
  }, new Map());

  const events: CalendarEvent[] = [];

  for (const schedule of scheduleRows) {
    const targetPlatforms = (schedule.targetPlatformIds ?? [])
      .map((platformId) => platformMap.get(platformId))
      .filter((platform): platform is PlatformRow => Boolean(platform));
    const occurrences = getCronOccurrences(schedule.cron, monthStart, monthEnd, 120);

    occurrences.forEach((at, index) => {
      const fixedContent = resolveFixedScheduleContent(
        schedule.config,
        targetPlatforms.map((platform) => platform.type),
        index,
        at
      );
      const preview = firstPlatformPreview(fixedContent, targetPlatforms);
      const media = getScheduleMediaBadges(schedule, preview);
      const platformsForEvent = targetPlatforms.map((platform) =>
        buildPlatformBadge(platform, {
          content: fixedContent?.contentByPlatform[getPlatformKey(platform.type)] ?? preview,
          contentType:
            schedule.jobType === "avatar_video"
              ? "avatar_video"
              : schedule.jobType === "image_post"
                ? "image"
                : "text",
          explicitInstagramType:
            fixedContent?.instagramContentTypeByPlatform[getPlatformKey(platform.type)] ?? null,
          media,
        })
      );

      const baseEvent = {
        id: `${schedule.id}-${at.toISOString()}`,
        dayKey: dayKey(at),
        at,
        label: fixedContent?.title ?? schedule.name,
        preview,
        content: fixedContent
          ? targetPlatforms
              .map((platform) => fixedContent.contentByPlatform[getPlatformKey(platform.type)])
              .find((value) => normalizeText(value)) ?? fixedContent.summary
          : schedule.description ?? null,
        mediaUrl: firstPlatformMediaUrl(fixedContent, targetPlatforms),
        tone: schedule.enabled ? ("planned" as const) : ("blocked" as const),
        kind: "schedule" as const,
        href: `/dashboard/schedules/${schedule.id}`,
        platforms: platformsForEvent,
        media,
        tags: getScheduleTags(schedule),
      };

      events.push({
        ...baseEvent,
        tooltip: buildEventTooltip(baseEvent),
      });
    });
  }

  for (const post of scheduledPostRows) {
    if (!post.scheduledAt) continue;

    const media = getMediaBadges(post.contentType, Boolean(normalizeText(post.content)));
    const platformsForEvent = (targetsByPostId.get(post.id) ?? [])
      .map((target) => platformMap.get(target.platformId))
      .filter((platform): platform is PlatformRow => Boolean(platform))
      .map((platform) =>
        buildPlatformBadge(platform, {
          content: post.content,
          contentType: post.contentType,
          media,
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
      platforms: platformsForEvent,
      media,
      tags: getPostTags(post),
    };

    events.push({
      ...baseEvent,
      tooltip: buildEventTooltip(baseEvent),
    });
  }

  for (const post of publishedPostRows) {
    if (!post.publishedAt) continue;

    const media = getMediaBadges(post.contentType, Boolean(normalizeText(post.content)));
    const platformsForEvent = (targetsByPostId.get(post.id) ?? [])
      .map((target) => platformMap.get(target.platformId))
      .filter((platform): platform is PlatformRow => Boolean(platform))
      .map((platform) =>
        buildPlatformBadge(platform, {
          content: post.content,
          contentType: post.contentType,
          media,
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
      platforms: platformsForEvent,
      media,
      tags: getPostTags(post),
    };

    events.push({
      ...baseEvent,
      tooltip: buildEventTooltip(baseEvent),
    });
  }

  for (const run of runRowsRaw) {
    if (run.postId) {
      continue;
    }

    const status = resolvePipelineRunStatus(run);
    const runPost = run.postId ? postMap.get(run.postId) ?? null : null;
    const schedule = run.scheduleId ? scheduleMap.get(run.scheduleId) ?? null : null;
    const media = runPost
      ? getMediaBadges(runPost.contentType, Boolean(normalizeText(runPost.content)))
      : [];
    const targetPlatforms = runPost
      ? (targetsByPostId.get(runPost.id) ?? [])
          .map((target) => platformMap.get(target.platformId))
          .filter((platform): platform is PlatformRow => Boolean(platform))
      : [];
    const platformsForEvent =
      targetPlatforms.length > 0
        ? targetPlatforms.map((platform) =>
            buildPlatformBadge(platform, {
              content: runPost?.content,
              contentType: runPost?.contentType,
              media,
            })
          )
        : [];

    const baseEvent = {
      id: run.id,
      dayKey: dayKey(new Date(run.startedAt)),
      at: new Date(run.startedAt),
      label: runPost?.title || schedule?.name || "Manual run",
      preview: shorten(runPost?.content || schedule?.description || null, 140),
      content: runPost?.content || schedule?.description || null,
      mediaUrl: runPost?.mediaUrl ?? null,
      tone: status === "completed" ? ("completed" as const) : status === "failed" ? ("failed" as const) : ("running" as const),
      kind: "run" as const,
      href: run.postId ? `/dashboard/posts/${run.postId}` : run.scheduleId ? `/dashboard/schedules/${run.scheduleId}` : null,
      platforms: platformsForEvent,
      media,
      tags: runPost ? getPostTags(runPost) : schedule ? getScheduleTags(schedule) : [],
    };

    events.push({
      ...baseEvent,
      tooltip: buildEventTooltip(baseEvent),
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
