function normalizePlatform(platform: string) {
  return platform === "x" ? "twitter" : platform.toLowerCase();
}

function platformKeys(platform: string) {
  const normalized = normalizePlatform(platform);
  return normalized === "twitter" ? [normalized, "x"] : [normalized];
}

function resolveAssetUrl(value: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return value;

  const base = process.env.APP_URL?.trim() || "http://localhost:3000";

  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => pickString(item))
    .filter((item): item is string => Boolean(item));
}

function pickPlatformString(
  source: Record<string, unknown> | null,
  platform: string
): string | null {
  if (!source) return null;

  for (const key of platformKeys(platform)) {
    const value = pickString(source[key]);
    if (value) return value;
  }

  return null;
}

function pickPlatformStringArray(
  source: Record<string, unknown> | null,
  platform: string
): string[] {
  if (!source) return [];

  for (const key of platformKeys(platform)) {
    const value = pickStringArray(source[key]);
    if (value.length > 0) return value;
  }

  return [];
}

function pickPlatformInstagramType(
  source: Record<string, unknown> | null,
  platform: string
): "story" | "reel" | null {
  if (!source) return null;

  for (const key of platformKeys(platform)) {
    const value = source[key];
    if (value === "reel") return "reel";
    if (value === "story") return "story";
  }

  return null;
}

export type FixedScheduleContent = {
  title: string;
  summary: string;
  variantIndex: number;
  contentByPlatform: Record<string, string>;
  mediaUrlByPlatform: Record<string, string | null>;
  instagramContentTypeByPlatform: Partial<
    Record<string, "story" | "reel">
  >;
};

function positiveModulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function resolveRotationIndex(
  config: Record<string, unknown>,
  fallbackIndex: number,
  runAt: Date
) {
  if (config.rotationMode !== "calendar_week") {
    return fallbackIndex;
  }

  const anchorValue = pickString(config.rotationAnchorDate);
  const anchorDate = anchorValue ? new Date(anchorValue) : runAt;
  const anchorTime = anchorDate.getTime();
  const runTime = runAt.getTime();

  if (!Number.isFinite(anchorTime) || !Number.isFinite(runTime)) {
    return fallbackIndex;
  }

  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor((runTime - anchorTime) / weekMs);
}

export function resolveFixedScheduleContent(
  config: unknown,
  platformTypes: string[],
  priorRunCount: number,
  runAt: Date = new Date()
): FixedScheduleContent | null {
  if (!isObject(config)) return null;

  const sharedContent = pickString(config.content);
  const sharedVariants = pickStringArray(config.contentVariants);
  const contentByPlatform = isObject(config.contentByPlatform)
    ? config.contentByPlatform
    : null;
  const variantsByPlatform = isObject(config.contentVariantsByPlatform)
    ? config.contentVariantsByPlatform
    : null;
  const mediaByPlatform = isObject(config.mediaUrlByPlatform)
    ? config.mediaUrlByPlatform
    : null;
  const mediaVariantsByPlatform = isObject(config.mediaUrlVariantsByPlatform)
    ? config.mediaUrlVariantsByPlatform
    : null;
  const instagramContentTypeByPlatform = isObject(
    config.instagramContentTypeByPlatform
  )
    ? config.instagramContentTypeByPlatform
    : null;

  const hasFixedContent =
    Boolean(sharedContent) ||
    sharedVariants.length > 0 ||
    Boolean(contentByPlatform) ||
    Boolean(variantsByPlatform) ||
    config.postMode === "fixed";

  if (!hasFixedContent) return null;

  const title = pickString(config.title) || "Scheduled campaign post";
  const summary = pickString(config.summary) || "Recurring fixed-content schedule";
  const sharedMediaUrl = pickString(config.mediaUrl);
  const sharedInstagramContentType =
    config.instagramContentType === "reel" ? "reel" : "story";
  const rotationIndex = resolveRotationIndex(config, priorRunCount, runAt);

  const resolvedContentByPlatform: Record<string, string> = {};
  const resolvedMediaUrlByPlatform: Record<string, string | null> = {};
  const resolvedInstagramContentTypeByPlatform: Partial<
    Record<string, "story" | "reel">
  > = {};

  for (const platformType of platformTypes) {
    const normalizedPlatform = normalizePlatform(platformType);
    const platformSpecific = pickPlatformString(contentByPlatform, platformType);
    const platformVariants = pickPlatformStringArray(
      variantsByPlatform,
      platformType
    );
    const platformMediaVariants = pickPlatformStringArray(
      mediaVariantsByPlatform,
      platformType
    );
    const platformMediaUrl = pickPlatformString(mediaByPlatform, platformType);
    const platformInstagramContentType = pickPlatformInstagramType(
      instagramContentTypeByPlatform,
      platformType
    );

    const variantSource =
      platformVariants && platformVariants.length > 0
        ? platformVariants
        : sharedVariants.length > 0
          ? sharedVariants
          : [];

    const variant =
      variantSource.length > 0
        ? variantSource[positiveModulo(rotationIndex, variantSource.length)]
        : null;
    const mediaVariant =
      platformMediaVariants.length > 0
        ? platformMediaVariants[
            positiveModulo(rotationIndex, platformMediaVariants.length)
          ]
        : null;

    resolvedContentByPlatform[normalizedPlatform] =
      platformSpecific || variant || sharedContent || title;
    resolvedMediaUrlByPlatform[normalizedPlatform] =
      resolveAssetUrl(mediaVariant || platformMediaUrl || sharedMediaUrl || null);

    if (normalizedPlatform === "instagram") {
      resolvedInstagramContentTypeByPlatform[normalizedPlatform] =
        platformInstagramContentType || sharedInstagramContentType;
    }
  }

  return {
    title,
    summary,
    variantIndex:
      sharedVariants.length > 0
        ? positiveModulo(rotationIndex, sharedVariants.length)
        : rotationIndex,
    contentByPlatform: resolvedContentByPlatform,
    mediaUrlByPlatform: resolvedMediaUrlByPlatform,
    instagramContentTypeByPlatform: resolvedInstagramContentTypeByPlatform,
  };
}
