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
  provider: "late" | "bird";
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
  mediaType?: "video" | "image";
  instagramContentType?: "reel" | "story";
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
  return ACCOUNT_IDS[platform] || providedAccountId || null;
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
      const platformEntry: Record<string, unknown> = { platform, accountId };

      if (platform === "instagram" && target.mediaUrl) {
        platformEntry.platformSpecificData = {
          contentType: target.instagramContentType || (target.mediaType === "video" ? "reel" : "story"),
        };
      }

      const body: Record<string, unknown> = {
        content: target.content,
        platforms: [platformEntry],
        publishNow: true,
      };

      if (target.mediaUrl) {
        body.mediaItems = [{ type: target.mediaType || "image", url: target.mediaUrl }];
      }

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
