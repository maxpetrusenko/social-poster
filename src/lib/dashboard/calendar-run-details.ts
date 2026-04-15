import { pipelineRuns, platforms, type PipelineStep } from "@/db/schema";
import { normalizePlatformType } from "./platforms";

type RunRow = typeof pipelineRuns.$inferSelect;
type PlatformRow = typeof platforms.$inferSelect;

type RunContentType = "text" | "image" | "video" | "avatar_video" | null;
type RunPlatformPublishStatus = "success" | "failed" | "skipped" | null;

export type CalendarRunPlatformDetails = {
  type: string;
  content: string | null;
  mediaUrl: string | null;
  contentType: RunContentType;
  explicitInstagramType: "story" | "reel" | null;
  publishStatus: RunPlatformPublishStatus;
};

export type CalendarRunDetails = {
  title: string | null;
  summary: string | null;
  sourceUrl: string | null;
  content: string | null;
  mediaUrl: string | null;
  contentType: RunContentType;
  platforms: CalendarRunPlatformDetails[];
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizePlatformKey(value: string | null | undefined) {
  return normalizePlatformType(value);
}

function isMediaType(value: string | null) {
  return value === "image" || value === "video" || value === "avatar_video";
}

function readMediaType(value: unknown): RunContentType {
  const normalized = asString(value)?.toLowerCase() ?? null;
  return isMediaType(normalized) ? normalized : null;
}

function readInstagramType(value: unknown): "story" | "reel" | null {
  return value === "story" || value === "reel" ? value : null;
}

function getStep(steps: PipelineStep[], name: string) {
  return steps.find((step) => step.name === name);
}

function upsertPlatform(
  accumulator: Map<string, CalendarRunPlatformDetails>,
  type: string | null | undefined,
  patch: Partial<CalendarRunPlatformDetails>
) {
  const normalizedType = normalizePlatformKey(type);
  if (!normalizedType) return;

  const current = accumulator.get(normalizedType) ?? {
    type: normalizedType,
    content: null,
    mediaUrl: null,
    contentType: null,
    explicitInstagramType: null,
    publishStatus: null,
  };

  accumulator.set(normalizedType, {
    ...current,
    content: patch.content ?? current.content,
    mediaUrl: patch.mediaUrl ?? current.mediaUrl,
    contentType: patch.contentType ?? current.contentType,
    explicitInstagramType: patch.explicitInstagramType ?? current.explicitInstagramType,
    publishStatus: patch.publishStatus ?? current.publishStatus,
  });
}

function readPublishStatus(record: Record<string, unknown>): RunPlatformPublishStatus {
  if (record.success === true) return "success";
  const classification = asString(record.classification);
  if (classification === "disabled" || classification === "duplicate") {
    return "skipped";
  }
  return "failed";
}

function readFirstMedia(
  raw: Record<string, unknown>
): { mediaUrl: string | null; contentType: RunContentType } {
  const mediaItems = Array.isArray(raw.mediaItems) ? raw.mediaItems : [];
  for (const item of mediaItems) {
    const record = asRecord(item);
    if (!record) continue;
    const mediaUrl = asString(record.url);
    if (!mediaUrl) continue;
    return {
      mediaUrl,
      contentType: readMediaType(record.type) ?? "image",
    };
  }

  const platformRows = Array.isArray(raw.platforms) ? raw.platforms : [];
  for (const item of platformRows) {
    const record = asRecord(item);
    if (!record) continue;
    const customMedia = Array.isArray(record.customMedia) ? record.customMedia : [];
    for (const mediaItem of customMedia) {
      const mediaRecord = asRecord(mediaItem);
      if (!mediaRecord) continue;
      const mediaUrl = asString(mediaRecord.url);
      if (!mediaUrl) continue;
      return {
        mediaUrl,
        contentType: readMediaType(mediaRecord.type) ?? "image",
      };
    }
  }

  return {
    mediaUrl: null,
    contentType: null,
  };
}

function firstAvailable<T>(
  order: string[],
  platforms: Map<string, CalendarRunPlatformDetails>,
  pick: (item: CalendarRunPlatformDetails) => T | null
) {
  for (const type of order) {
    const item = platforms.get(type);
    if (!item) continue;
    const value = pick(item);
    if (value) return value;
  }

  for (const item of platforms.values()) {
    const value = pick(item);
    if (value) return value;
  }

  return null;
}

export function deriveCalendarRunDetails(
  run: Pick<RunRow, "steps">,
  targetPlatforms: Array<Pick<PlatformRow, "type">>
): CalendarRunDetails {
  const steps = run.steps ?? [];
  const orderedPlatformTypes = targetPlatforms
    .map((platform) => normalizePlatformKey(platform.type))
    .filter(Boolean);
  const platformDetails = new Map<string, CalendarRunPlatformDetails>();

  const feedPullOutput = asRecord(getStep(steps, "feed:pull")?.output);
  const contentLoadOutput = asRecord(getStep(steps, "content:load")?.output);
  const captionWriteOutput = asRecord(getStep(steps, "caption:write")?.output);
  const publishOutput = asRecord(getStep(steps, "publish")?.output);

  const title =
    asString(contentLoadOutput?.title) ??
    asString(feedPullOutput?.title) ??
    null;
  const summary =
    asString(contentLoadOutput?.summary) ??
    asString(feedPullOutput?.summary) ??
    null;
  const sourceUrl = asString(feedPullOutput?.link);
  const feedImageUrl = asString(feedPullOutput?.imageUrl);

  const loadedContentByPlatform = asRecord(contentLoadOutput?.contentByPlatform);
  if (loadedContentByPlatform) {
    for (const [type, value] of Object.entries(loadedContentByPlatform)) {
      upsertPlatform(platformDetails, type, {
        content: asString(value),
      });
    }
  }

  const loadedMediaByPlatform = asRecord(contentLoadOutput?.mediaUrlByPlatform);
  if (loadedMediaByPlatform) {
    for (const [type, value] of Object.entries(loadedMediaByPlatform)) {
      const mediaUrl = asString(value);
      upsertPlatform(platformDetails, type, {
        mediaUrl,
        contentType: mediaUrl ? "image" : null,
      });
    }
  }

  const instagramTypeByPlatform = asRecord(
    contentLoadOutput?.instagramContentTypeByPlatform
  );
  if (instagramTypeByPlatform) {
    for (const [type, value] of Object.entries(instagramTypeByPlatform)) {
      upsertPlatform(platformDetails, type, {
        explicitInstagramType: readInstagramType(value),
      });
    }
  }

  const captions = Array.isArray(captionWriteOutput?.captions)
    ? captionWriteOutput.captions
    : [];
  for (const item of captions) {
    const record = asRecord(item);
    if (!record) continue;
    const mediaUrl = asString(record.mediaUrl);
    upsertPlatform(platformDetails, asString(record.platform), {
      content: asString(record.content),
      mediaUrl,
      contentType:
        readMediaType(record.mediaType) ?? (mediaUrl ? "image" : null),
      explicitInstagramType: readInstagramType(record.instagramContentType),
    });
  }

  const outcomes = Array.isArray(publishOutput?.outcomes) ? publishOutput.outcomes : [];
  for (const item of outcomes) {
    const record = asRecord(item);
    if (!record) continue;
    const raw = asRecord(record.raw);
    const post = asRecord(raw?.post) ?? raw;
    if (!post) continue;
    const media = readFirstMedia(post);
    upsertPlatform(platformDetails, asString(record.platform), {
      content: asString(post.content),
      mediaUrl: media.mediaUrl,
      contentType: media.contentType,
      publishStatus: readPublishStatus(record),
    });
  }

  if (feedImageUrl) {
    for (const type of orderedPlatformTypes) {
      const current = platformDetails.get(type);
      if (current?.mediaUrl) continue;
      upsertPlatform(platformDetails, type, {
        mediaUrl: feedImageUrl,
        contentType: "image",
      });
    }
  }

  const content =
    firstAvailable(orderedPlatformTypes, platformDetails, (item) => item.content) ??
    summary;
  const mediaUrl =
    firstAvailable(orderedPlatformTypes, platformDetails, (item) => item.mediaUrl) ??
    feedImageUrl;
  const contentType =
    firstAvailable(orderedPlatformTypes, platformDetails, (item) => item.contentType) ??
    (mediaUrl ? "image" : null);

  const orderedPlatforms = [
    ...orderedPlatformTypes
      .map((type) => platformDetails.get(type))
      .filter((value): value is CalendarRunPlatformDetails => Boolean(value)),
    ...Array.from(platformDetails.values()).filter(
      (value) => !orderedPlatformTypes.includes(value.type)
    ),
  ];

  return {
    title,
    summary,
    sourceUrl,
    content,
    mediaUrl,
    contentType,
    platforms: orderedPlatforms,
  };
}
