import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import crypto from "node:crypto";
import { getPublicAppUrlFromEnv } from "../app-url";
import { OAuthProvider, buildAuthUrl } from "./oauth";
import { PublishError } from "./errors";
import type {
  AccountProfile,
  MediaType,
  OAuthTokens,
  PostType,
  DeleteResult,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const USERS_ME_URL = "https://api.x.com/2/users/me";
const TWEETS_URL = "https://api.x.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload";
const MEDIA_CHUNK_BYTES = 5 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;
type XMediaUploadData = {
  id?: string;
  media_key?: string;
  processing_info?: {
    state?: string;
    check_after_secs?: number;
    progress_percent?: number;
    error?: { name?: string; message?: string };
  };
};

export class TwitterProvider extends OAuthProvider {
  platformName = "Twitter/X";
  authType = "oauth2" as const;
  maxCaptionLength = 280;
  supportedPostTypes: PostType[] = ["text", "image", "video"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4", "mov", "webp"];
  requiredScopes = [
    "tweet.read",
    "tweet.write",
    "users.read",
    "media.write",
    "dm.read",
    "dm.write",
    "offline.access",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 300,
      requestsPerDay: 2400,
      publishPerDay: 300,
    };
  }

  getAuthUrl(redirectUri: string, state: string, codeVerifier?: string): string {
    const verifier = codeVerifier || state;
    return buildAuthUrl(AUTH_URL, {
      response_type: "code",
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(" "),
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    });
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    codeVerifier?: string
  ): Promise<OAuthTokens> {
    if (!codeVerifier) {
      throw new Error("Twitter/X OAuth callback missing PKCE verifier");
    }

    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.clientId()}:${this.clientSecret()}`
        ).toString("base64")}`,
      },
      form: {
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${this.clientId()}:${this.clientSecret()}`
        ).toString("base64")}`,
      },
      form: {
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
    });
    const result = this.tokenToResult(body);
    return { ...result, refreshToken: result.refreshToken ?? refreshToken };
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestJson<JsonRecord>("GET", USERS_ME_URL, {
      accessToken,
      params: {
        "user.fields": "username,name,profile_image_url,public_metrics",
      },
    });
    const data = readRecord(body, "data");
    const metrics = readRecord(data, "public_metrics");
    const username = readString(data, "username");

    return {
      platformId: readString(data, "id"),
      name: readString(data, "name") || username || "Twitter/X User",
      handle: username ? `@${username}` : undefined,
      avatarUrl: readString(data, "profile_image_url") || undefined,
      followerCount: readInteger(metrics, "followers_count"),
      extra: { publicMetrics: metrics },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const media = await collectMedia(content);
    const mediaIds = await this.uploadMediaItems(accessToken, media);

    const body = await this.requestJson<JsonRecord>("POST", TWEETS_URL, {
      accessToken,
      json: {
        text: content.text,
        ...(mediaIds.length > 0
          ? { media: { media_ids: mediaIds } }
          : {}),
      },
    });
    const data = readRecord(body, "data");
    const id = readString(data, "id");

    return {
      platformPostId: id,
      url: id ? `https://x.com/i/web/status/${id}` : undefined,
      extra: body,
    };
  }

  private async uploadMediaItems(
    accessToken: string,
    media: MediaItem[]
  ): Promise<string[]> {
    if (media.length === 0) return [];

    const nonPhoto = media.filter((item) => !isPhotoMime(item.mimeType));
    if (nonPhoto.length > 0 && media.length > 1) {
      throw new PublishError("Twitter/X supports either up to 4 photos, 1 GIF, or 1 video per post.", {
        platform: this.platformName,
      });
    }

    if (nonPhoto.length === 0 && media.length > 4) {
      throw new PublishError("Twitter/X supports at most 4 photos per post.", {
        platform: this.platformName,
      });
    }

    const mediaIds: string[] = [];
    for (const item of media) {
      mediaIds.push(await this.uploadMedia(accessToken, item));
    }
    return mediaIds;
  }

  private async uploadMedia(accessToken: string, media: MediaItem) {
    const init = await this.requestJson<JsonRecord>(
      "POST",
      `${MEDIA_UPLOAD_URL}/initialize`,
      {
        accessToken,
        json: {
          media_category: mediaCategoryForMime(media.mimeType),
          media_type: media.mimeType,
          total_bytes: media.bytes.byteLength,
        },
      }
    );
    const initData = readRecord(init, "data") as XMediaUploadData;
    const mediaId = readString(initData, "id");
    if (!mediaId) {
      throw new PublishError("Twitter/X media upload initialize response missing id", {
        platform: this.platformName,
        rawResponse: init,
      });
    }

    for (let offset = 0, segmentIndex = 0; offset < media.bytes.byteLength; offset += MEDIA_CHUNK_BYTES, segmentIndex += 1) {
      const chunk = media.bytes.slice(offset, Math.min(media.bytes.byteLength, offset + MEDIA_CHUNK_BYTES));
      const form = new FormData();
      form.set("segment_index", String(segmentIndex));
      form.set("media", new Blob([chunk], { type: media.mimeType }), media.filename);
      await this.request(
        "POST",
        `${MEDIA_UPLOAD_URL}/${encodeURIComponent(mediaId)}/append`,
        {
          accessToken,
          body: form,
          timeoutMs: 120_000,
        }
      );
    }

    const finalized = await this.requestJson<JsonRecord>(
      "POST",
      `${MEDIA_UPLOAD_URL}/${encodeURIComponent(mediaId)}/finalize`,
      { accessToken }
    );
    await this.waitForMediaProcessing(accessToken, mediaId, finalized);
    return mediaId;
  }

  private async waitForMediaProcessing(
    accessToken: string,
    mediaId: string,
    initial: JsonRecord
  ) {
    let info = readProcessingInfo(initial);
    let attempts = 0;
    while (info && info.state && info.state !== "succeeded") {
      if (info.state === "failed") {
        throw new PublishError(
          `Twitter/X media processing failed: ${info.error?.message ?? info.error?.name ?? "unknown error"}`,
          { platform: this.platformName, rawResponse: initial }
        );
      }

      if (attempts >= 20) {
        throw new PublishError("Twitter/X media processing did not finish in time", {
          platform: this.platformName,
        });
      }

      await sleep(Math.max(1, info.check_after_secs ?? 2) * 1000);
      const status = await this.requestJson<JsonRecord>("GET", MEDIA_UPLOAD_URL, {
        accessToken,
        params: {
          command: "STATUS",
          media_id: mediaId,
        },
      });
      info = readProcessingInfo(status);
      attempts += 1;
    }
  }

  async deletePost(
    accessToken: string,
    platformPostId: string
  ): Promise<DeleteResult> {
    const body = await this.requestJson<JsonRecord>(
      "DELETE",
      `${TWEETS_URL}/${encodeURIComponent(platformPostId)}`,
      { accessToken }
    );
    const data = readRecord(body, "data");

    return {
      deleted: readBoolean(data, "deleted"),
      extra: body,
    };
  }
}

function pkceChallenge(verifier: string) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

type MediaItem = {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
};

async function collectMedia(content: PublishContent): Promise<MediaItem[]> {
  const items: MediaItem[] = [];

  for (const file of content.mediaFiles ?? []) {
    const bytes = new Uint8Array(await readFile(file));
    items.push({
      bytes,
      mimeType: mimeFromName(file),
      filename: basename(file),
    });
  }

  for (const url of content.mediaUrls ?? []) {
    const mediaUrl = resolveMediaUrl(url);
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new PublishError(`Failed to fetch Twitter/X media URL: ${response.status}`, {
        platform: "Twitter/X",
      });
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = normalizeMimeType(response.headers.get("Content-Type")) ?? mimeFromName(mediaUrl);
    items.push({
      bytes,
      mimeType,
      filename: basename(new URL(mediaUrl).pathname) || "media",
    });
  }

  return items;
}

function resolveMediaUrl(source: string) {
  try {
    return new URL(source).toString();
  } catch {
    return new URL(source, getPublicAppUrlFromEnv()).toString();
  }
}

function mediaCategoryForMime(mimeType: string) {
  if (mimeType === "image/gif") return "tweet_gif";
  if (mimeType.startsWith("image/")) return "tweet_image";
  if (mimeType.startsWith("video/")) return "tweet_video";
  throw new PublishError(`Twitter/X media type is not supported: ${mimeType}`, {
    platform: "Twitter/X",
  });
}

function isPhotoMime(mimeType: string) {
  return mimeType.startsWith("image/") && mimeType !== "image/gif";
}

function readProcessingInfo(body: JsonRecord) {
  const data = readRecord(body, "data") as XMediaUploadData;
  return data.processing_info;
}

function mimeFromName(source: string) {
  const pathname = source.startsWith("http://") || source.startsWith("https://")
    ? new URL(source).pathname
    : source;
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

function normalizeMimeType(value: string | null) {
  const normalized = value?.split(";")[0]?.trim().toLowerCase();
  return normalized || null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readRecord(source: JsonRecord, key: string): JsonRecord {
  const value = source[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(source: JsonRecord, key: string) {
  const value = source[key];
  return typeof value === "string" ? value : "";
}

function readInteger(source: JsonRecord, key: string) {
  const value = source[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readBoolean(source: JsonRecord, key: string) {
  const value = source[key];
  return value === true;
}
