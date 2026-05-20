import type { InstagramPublishContentType } from "@/lib/post-publish-metadata";
import { mediaTypeFromUrl } from "@/lib/media-url";

const LATE_URL = "https://getlate.dev/api/v1/posts";

const ACCOUNT_IDS: Record<string, string> = {
  twitter: "690248619d65616f16a5c5bc",
  linkedin: "69024a4c9d65616f16a5c5c0",
  instagram: "69024a779d65616f16a5c5c1",
  tiktok: "6998bbc78ab8ae478b38b1cc",
  facebook: "69024a999d65616f16a5c5c2",
};

export type PublishClassification =
  | "success"
  | "disabled"
  | "duplicate"
  | "rate_limited"
  | "validation_error"
  | "auth_error"
  | "provider_error"
  | "network_error";

export interface PublishResult {
  platform: string;
  provider: "late" | "bird" | "direct";
  accountId: string | null;
  success: boolean;
  classification: PublishClassification;
  postId?: string;
  postUrl?: string;
  error?: string;
  raw?: unknown;
}

export interface PublishTarget {
  platform: string;
  accountId?: string | null;
  content: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: "video" | "image";
  instagramContentType?: InstagramPublishContentType;
  platformFormat?: string;
  firstComment?: string;
  collaborators?: string[];
}

function getToken(): string {
  const t = process.env.LATE_API_KEY || process.env.GETLATE_DEV_API_KEY_FREE || process.env.GETLATE_API_KEY;
  if (!t) throw new Error("No LATE_API_KEY");
  return t;
}

function normalizePlatform(platform: string): string {
  const value = platform.toLowerCase();
  return value === "x" ? "twitter" : value;
}

export function resolvePublishAccountId(platform: string, providedAccountId?: string | null): string | null {
  return providedAccountId || ACCOUNT_IDS[platform] || null;
}

function classifyLateError(status: number, message: string): PublishClassification {
  const normalized = message.toLowerCase();

  if (
    status === 409 ||
    normalized.includes("duplicate") ||
    normalized.includes("already exists") ||
    normalized.includes("already been posted")
  ) {
    return "duplicate";
  }

  if (status === 401 || status === 403) {
    return "auth_error";
  }

  if (status === 429 || normalized.includes("rate limit")) {
    return "rate_limited";
  }

  if (status === 400 || status === 422) {
    return "validation_error";
  }

  return "provider_error";
}

type LatePlatformFailure = {
  classification: PublishClassification;
  error: string;
};

export function getLatePlatformFailure(
  platform: string,
  data: Record<string, unknown>,
  matchedPlatform: Record<string, unknown> | undefined
): LatePlatformFailure | null {
  const platformResults = Array.isArray(data.platformResults)
    ? (data.platformResults as Record<string, unknown>[])
    : [];
  const matchedResult = platformResults.find(
    (entry) => String(entry.platform || "").toLowerCase() === platform
  );
  const platformStatus = String(
    matchedPlatform?.status || matchedResult?.status || ""
  ).toLowerCase();
  const error =
    String(matchedPlatform?.errorMessage || matchedResult?.error || data.error || "")
      .trim();

  if (platformStatus === "published" && !error) {
    return null;
  }

  if (!platformStatus && !error) {
    return null;
  }

  return {
    classification:
      platformStatus === "pending" && error
        ? "provider_error"
        : classifyLateError(200, error || platformStatus),
    error:
      error ||
      `Late returned platform status "${platformStatus || "unknown"}" for ${platform}.`,
  };
}

export function buildLatePostBody(target: PublishTarget): Record<string, unknown> {
  const platform = normalizePlatform(target.platform);
  const accountId = resolvePublishAccountId(platform, target.accountId);
  if (!accountId) {
    throw new Error(`Unknown account ID for platform: ${platform}`);
  }

  const platformEntry: Record<string, unknown> = { platform, accountId };
  const mediaUrls = resolvePublishMediaUrls(target);
  const platformSpecificData = buildLatePlatformSpecificData(platform, target, mediaUrls);

  if (Object.keys(platformSpecificData).length > 0) {
    platformEntry.platformSpecificData = platformSpecificData;
  }

  const body: Record<string, unknown> = {
    content: target.content,
    platforms: [platformEntry],
    publishNow: true,
  };

  if (mediaUrls.length > 0) {
    body.mediaItems = mediaUrls.map((url) => ({
      type: resolveMediaItemType(url, target.mediaType),
      url,
    }));
  }

  return body;
}

export async function publishToLate(targets: PublishTarget[]): Promise<PublishResult[]> {
  const token = getToken();
  const results: PublishResult[] = [];

  for (const target of targets) {
    const platform = normalizePlatform(target.platform);
    const accountId = resolvePublishAccountId(platform, target.accountId);
    if (!accountId) {
      results.push({
        platform,
        provider: "late",
        accountId: null,
        success: false,
        classification: "auth_error",
        error: `Unknown account ID for platform: ${platform}`,
      });
      continue;
    }

    try {
      const body = buildLatePostBody({ ...target, platform, accountId });

      const res = await fetch(LATE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        results.push({
          platform,
          provider: "late",
          accountId,
          success: false,
          classification: classifyLateError(res.status, err),
          error: `${res.status}: ${err.slice(0, 200)}`,
          raw: err.slice(0, 500),
        });
        continue;
      }

      const data = (await res.json()) as Record<string, unknown>;
      const postObj = data.post as Record<string, unknown> | undefined;
      const platformRows = Array.isArray(postObj?.platforms) ? (postObj?.platforms as Record<string, unknown>[]) : [];
      const matchedPlatform = platformRows.find((entry) => String(entry.platform || "").toLowerCase() === platform);
      const platformFailure = getLatePlatformFailure(platform, data, matchedPlatform);
      const postId = (postObj?._id || data.id || "") as string;
      const postUrl = (matchedPlatform?.platformPostUrl || postObj?.url || data.url || "") as string;

      if (platformFailure) {
        results.push({
          platform,
          provider: "late",
          accountId,
          success: false,
          classification: platformFailure.classification,
          postId,
          postUrl,
          error: platformFailure.error,
          raw: data,
        });
        continue;
      }

      console.log(`[publish] ${platform} → ${postId}`);
      results.push({
        platform,
        provider: "late",
        accountId,
        success: true,
        classification: "success",
        postId,
        postUrl,
        raw: data,
      });
    } catch (err) {
      results.push({
        platform,
        provider: "late",
        accountId,
        success: false,
        classification: "network_error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

function buildLatePlatformSpecificData(
  platform: string,
  target: PublishTarget,
  mediaUrls: string[]
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  if (platform === "instagram") {
    if (target.instagramContentType === "story") {
      data.contentType = "story";
    } else if (target.instagramContentType === "reel") {
      data.contentType = "reels";
      data.shareToFeed = true;
    } else if (
      target.instagramContentType === "carousel" ||
      target.platformFormat?.toLowerCase() === "carousel" ||
      mediaUrls.length > 1
    ) {
      data.contentType = "carousel";
    }

    if (target.firstComment && target.instagramContentType !== "story") {
      data.firstComment = target.firstComment;
    }

    if (
      target.collaborators?.length &&
      target.instagramContentType !== "story"
    ) {
      data.collaborators = target.collaborators;
    }
  }

  if (platform === "facebook") {
    const format = target.platformFormat?.toLowerCase();
    if (format === "story") {
      data.contentType = "story";
    } else if (format === "reel") {
      data.contentType = "reel";
    }

    if (target.firstComment && format !== "story") {
      data.firstComment = target.firstComment;
    }
  }

  if (platform === "linkedin" && target.firstComment) {
    data.firstComment = target.firstComment;
  }

  return data;
}

function resolvePublishMediaUrls(target: PublishTarget): string[] {
  const mediaUrls = (target.mediaUrls ?? [])
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (mediaUrls.length > 0) {
    return mediaUrls;
  }

  const mediaUrl = target.mediaUrl?.trim();
  return mediaUrl ? [mediaUrl] : [];
}

function resolveMediaItemType(
  url: string,
  fallbackType?: "image" | "video"
): "image" | "video" {
  return fallbackType ?? mediaTypeFromUrl(url) ?? "image";
}
