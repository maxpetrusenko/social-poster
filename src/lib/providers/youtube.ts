import { readFile } from "node:fs/promises";
import { OAuthProvider, buildAuthUrl } from "./oauth";
import { PublishError } from "./errors";
import type {
  AccountProfile,
  MediaType,
  OAuthTokens,
  PostType,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://www.googleapis.com/youtube/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/youtube/v3";

type JsonRecord = Record<string, unknown>;

export class YouTubeProvider extends OAuthProvider {
  platformName = "YouTube";
  authType = "oauth2" as const;
  maxCaptionLength = 5000;
  supportedPostTypes: PostType[] = ["video", "short"];
  supportedMediaTypes: MediaType[] = ["mp4", "mov"];
  requiredScopes = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/youtube.force-ssl",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 600,
      requestsPerDay: 10000,
      publishPerDay: 6,
      extra: { quotaUnitsPerDay: 10000, uploadCostUnits: 1600 },
    };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(AUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(" "),
      response_type: "code",
      access_type: "offline",
      include_granted_scopes: "true",
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        code,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        refresh_token: refreshToken,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        grant_type: "refresh_token",
      },
    });
    const result = this.tokenToResult(body);
    return { ...result, refreshToken: result.refreshToken ?? refreshToken };
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestJson<JsonRecord>("GET", `${API_BASE}/channels`, {
      accessToken,
      params: { part: "snippet,statistics", mine: true },
    });
    const channel = readArray(body, "items")[0];
    if (!channel) return { platformId: "", name: "Unknown" };

    const snippet = readRecord(channel, "snippet");
    const stats = readRecord(channel, "statistics");
    const thumbnails = readRecord(snippet, "thumbnails");
    const avatar =
      readString(readRecord(thumbnails, "default"), "url") ||
      readString(readRecord(thumbnails, "medium"), "url");

    return {
      platformId: readString(channel, "id"),
      name: readString(snippet, "title"),
      handle: readString(snippet, "customUrl") || undefined,
      avatarUrl: avatar || undefined,
      followerCount: readInteger(stats, "subscriberCount"),
      extra: {
        viewCount: readInteger(stats, "viewCount"),
        videoCount: readInteger(stats, "videoCount"),
      },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const postType = content.postType ?? "video";
    if (postType !== "video" && postType !== "short") {
      throw new PublishError("YouTube only supports video and short posts", {
        platform: this.platformName,
      });
    }

    const source = content.mediaFiles?.[0] ?? content.mediaUrls?.[0];
    if (!source) {
      throw new PublishError("No video source provided for YouTube", {
        platform: this.platformName,
      });
    }

    let title = content.title || content.text || "";
    if (postType === "short" && !title.includes("#Shorts")) {
      title = `${title} #Shorts`.trim();
    }

    const initResponse = await this.request("POST", `${UPLOAD_BASE}/videos`, {
      accessToken,
      params: { uploadType: "resumable", part: "snippet,status" },
      json: {
        snippet: {
          title: title.slice(0, 100),
          description: (content.description || content.text || "").slice(
            0,
            this.maxCaptionLength
          ),
          tags: readStringArray(content.extra, "tags"),
          categoryId: readString(content.extra, "category_id") || "22",
        },
        status: {
          privacyStatus: readString(content.extra, "privacy_status") || "public",
          selfDeclaredMadeForKids: readBoolean(
            content.extra,
            "self_declared_made_for_kids"
          ),
        },
      },
    });
    const uploadUri = initResponse.headers.get("Location");
    if (!uploadUri) {
      throw new PublishError("YouTube did not return a resumable upload URI", {
        platform: this.platformName,
      });
    }

    const bytes = await readBytes(source);
    const uploadResponse = await this.request("PUT", uploadUri, {
      headers: {
        "Content-Type": "video/*",
        "Content-Length": String(bytes.byteLength),
      },
      body: toArrayBuffer(bytes),
      timeoutMs: 300_000,
    });
    const uploadBody = (await uploadResponse.json()) as JsonRecord;
    const videoId = readString(uploadBody, "id");

    const thumbnail = readString(content.extra, "thumbnail_file");
    if (videoId && thumbnail) await this.uploadThumbnail(accessToken, videoId, thumbnail);

    return {
      platformPostId: videoId,
      url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : undefined,
      extra: uploadBody,
    };
  }

  private async uploadThumbnail(
    accessToken: string,
    videoId: string,
    path: string
  ) {
    const bytes = new Uint8Array(await readFile(path));
    const contentType = path.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    await this.request("POST", `${UPLOAD_BASE}/thumbnails/set`, {
      accessToken,
      params: { videoId, uploadType: "media" },
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(bytes.byteLength),
      },
      body: toArrayBuffer(bytes),
      timeoutMs: 60_000,
    });
  }
}

async function readBytes(source: string): Promise<Uint8Array> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Media download failed ${response.status}: ${source}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array(await readFile(source));
}

function readRecord(source: unknown, key: string): JsonRecord {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const value = (source as JsonRecord)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readArray(source: unknown, key: string): JsonRecord[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  const value = (source as JsonRecord)[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is JsonRecord =>
          !!item && typeof item === "object" && !Array.isArray(item)
      )
    : [];
}

function readString(source: unknown, key: string): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const value = (source as JsonRecord)[key];
  return typeof value === "string" ? value : "";
}

function readStringArray(source: unknown, key: string): string[] {
  if (!source || typeof source !== "object" || Array.isArray(source)) return [];
  const value = (source as JsonRecord)[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readBoolean(source: unknown, key: string): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const value = (source as JsonRecord)[key];
  return typeof value === "boolean" ? value : false;
}

function readInteger(source: unknown, key: string): number | undefined {
  const value = readString(source, key);
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export default YouTubeProvider;
