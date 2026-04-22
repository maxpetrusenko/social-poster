import type { ImageSpec } from "@/lib/platform-specs";

export type InstagramPublishContentType = "feed" | "reel" | "story" | "carousel";

export type StoredPlatformOverride = {
  caption?: string;
  firstComment?: string;
  format?: string;
  collaborators?: string[];
};

export type PostPublishMetadata = {
  platformOverrides: Record<string, StoredPlatformOverride>;
  previewSpecs: Record<string, ImageSpec>;
  mediaUrls: string[];
  mediaUrlsByPlatformId: Record<string, string[]>;
  mediaUrlsByPlatformType: Record<string, string[]>;
  mediaUrlByPlatformId: Record<string, string>;
  mediaUrlByPlatformType: Record<string, string>;
};

export type PublishPlatformIdentity = {
  id: string;
  type: string;
};

export function normalizePostPublishMetadata(
  value: unknown
): PostPublishMetadata {
  const record = isRecord(value) ? value : {};
  const mediaUrls = readStringArray(record.mediaUrls);
  const mediaUrlsByPlatformId = readStringArrayMap(record.mediaUrlsByPlatformId);
  const mediaUrlsByPlatformType = readStringArrayMap(record.mediaUrlsByPlatformType);
  const legacyMediaUrlsByPlatformId = readStringMap(record.mediaUrlByPlatformId);
  const legacyMediaUrlsByPlatformType = readStringMap(record.mediaUrlByPlatformType);

  return {
    platformOverrides: readOverrideMap(record.platformOverrides),
    previewSpecs: readPreviewSpecMap(record.previewSpecs),
    mediaUrls,
    mediaUrlsByPlatformId,
    mediaUrlsByPlatformType,
    mediaUrlByPlatformId: mediaUrlsToStringMap(mediaUrlsByPlatformId, legacyMediaUrlsByPlatformId),
    mediaUrlByPlatformType: mediaUrlsToStringMap(mediaUrlsByPlatformType, legacyMediaUrlsByPlatformType),
  };
}

export function resolvePlatformOverride(
  metadata: PostPublishMetadata,
  platform: PublishPlatformIdentity
): StoredPlatformOverride {
  return (
    metadata.platformOverrides[platform.id] ??
    metadata.platformOverrides[platform.type] ??
    {}
  );
}

export function resolvePlatformMediaUrls(
  metadata: PostPublishMetadata,
  platform: PublishPlatformIdentity,
  fallbackMediaUrl: string | null | undefined
): string[] {
  const platformMediaUrls =
    metadata.mediaUrlsByPlatformId[platform.id] ??
    metadata.mediaUrlsByPlatformType[platform.type] ??
    [];

  if (platformMediaUrls.length > 0) {
    return platformMediaUrls;
  }

  if (metadata.mediaUrls.length > 0) {
    return metadata.mediaUrls;
  }

  const legacyUrl =
    metadata.mediaUrlByPlatformId[platform.id] ??
    metadata.mediaUrlByPlatformType[platform.type] ??
    "";
  if (legacyUrl) {
    return [legacyUrl];
  }

  const fallbackUrl = fallbackMediaUrl?.trim();
  return fallbackUrl ? [fallbackUrl] : [];
}

export function resolvePlatformMediaUrl(
  metadata: PostPublishMetadata,
  platform: PublishPlatformIdentity,
  fallbackMediaUrl: string | null | undefined
): string | undefined {
  return (
    resolvePlatformMediaUrls(metadata, platform, fallbackMediaUrl)[0] ??
    undefined
  );
}

export function resolveInstagramContentType(input: {
  platformType: string;
  format?: string | null;
  contentType: string;
  mediaUrlCount?: number;
}): InstagramPublishContentType | undefined {
  const platformType = input.platformType.toLowerCase();
  if (platformType !== "instagram" && platformType !== "instagram_personal") {
    return undefined;
  }

  const format = input.format?.toLowerCase();
  if (format === "story") return "story";
  if (format === "reel") return "reel";
  if (format === "carousel") return "carousel";
  if (format === "feed") return "feed";
  if ((input.mediaUrlCount ?? 0) > 1) return "carousel";
  if (input.contentType === "video" || input.contentType === "avatar_video") {
    return "reel";
  }

  return "feed";
}

function readOverrideMap(value: unknown): Record<string, StoredPlatformOverride> {
  if (!isRecord(value)) return {};
  const output: Record<string, StoredPlatformOverride> = {};

  for (const [key, item] of Object.entries(value)) {
    if (!isRecord(item)) continue;
    const override: StoredPlatformOverride = {};
    if (typeof item.caption === "string") override.caption = item.caption;
    if (typeof item.firstComment === "string") override.firstComment = item.firstComment;
    if (typeof item.format === "string") override.format = item.format;
    if (Array.isArray(item.collaborators)) {
      override.collaborators = item.collaborators.filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
      );
    }
    output[key] = override;
  }

  return output;
}

function readPreviewSpecMap(value: unknown): Record<string, ImageSpec> {
  if (!isRecord(value)) return {};
  const output: Record<string, ImageSpec> = {};

  for (const [key, item] of Object.entries(value)) {
    if (!isRecord(item)) continue;
    if (typeof item.width !== "number" || typeof item.height !== "number") continue;
    output[key] = {
      label: typeof item.label === "string" ? item.label : "Post",
      width: item.width,
      height: item.height,
      aspect: typeof item.aspect === "string" ? item.aspect : `${item.width}:${item.height}`,
      minWidth: typeof item.minWidth === "number" ? item.minWidth : undefined,
      minHeight: typeof item.minHeight === "number" ? item.minHeight : undefined,
      maxSizeMb: typeof item.maxSizeMb === "number" ? item.maxSizeMb : undefined,
    };
  }

  return output;
}

function readStringMap(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const output: Record<string, string> = {};

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.trim()) {
      output[key] = item.trim();
    }
  }

  return output;
}

export function readStringArrayMap(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) return {};
  const output: Record<string, string[]> = {};

  for (const [key, item] of Object.entries(value)) {
    const normalized = readStringArray(item);
    if (normalized.length > 0) {
      output[key] = normalized;
    }
  }

  return output;
}

export function readStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }

  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function mediaUrlsToStringMap(
  primary: Record<string, string[]>,
  fallback: Record<string, string>
): Record<string, string> {
  const output: Record<string, string> = { ...fallback };

  for (const [key, urls] of Object.entries(primary)) {
    if (urls.length > 0) {
      output[key] = urls[0];
    }
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
