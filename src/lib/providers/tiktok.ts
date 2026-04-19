import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
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

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const API_BASE = "https://open.tiktokapis.com/v2";
const DEFAULT_PRIVACY_LEVEL = "PUBLIC_TO_EVERYONE";
const VALID_PRIVACY_LEVELS = new Set([
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
]);

type JsonRecord = Record<string, unknown>;

export class TikTokProvider extends OAuthProvider {
  platformName = "TikTok";
  authType = "oauth2" as const;
  maxCaptionLength = 2200;
  supportedPostTypes: PostType[] = ["video"];
  supportedMediaTypes: MediaType[] = ["mp4", "mov"];
  requiredScopes = [
    "user.info.basic",
    "video.publish",
    "video.upload",
    "comment.list",
    "comment.list.manage",
  ];

  get rateLimits(): RateLimitConfig {
    return { requestsPerHour: 200, requestsPerDay: 5000, publishPerDay: 5 };
  }

  getAuthUrl(redirectUri: string, state: string, codeVerifier?: string): string {
    const verifier = codeVerifier || state;
    return buildAuthUrl(AUTH_URL, {
      client_key: this.clientKey(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(","),
      response_type: "code",
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
      throw new Error("TikTok OAuth callback missing PKCE verifier");
    }

    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        client_key: this.clientKey(),
        client_secret: this.clientSecret(),
        code,
        code_verifier: codeVerifier,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        client_key: this.clientKey(),
        client_secret: this.clientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
    });
    return this.tokenToResult(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestJson<JsonRecord>(
      "GET",
      `${API_BASE}/user/info/`,
      {
        accessToken,
        params: {
          fields: "open_id,union_id,avatar_url,display_name,follower_count",
        },
      }
    );
    const user = readRecord(readRecord(body, "data"), "user");
    return {
      platformId: readString(user, "open_id"),
      name: readString(user, "display_name"),
      avatarUrl: readString(user, "avatar_url") || undefined,
      followerCount: readNumber(user, "follower_count"),
      extra: { unionId: readString(user, "union_id"), raw: user },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    if ((content.postType ?? "video") !== "video") {
      throw new PublishError("TikTok only supports video posts", {
        platform: this.platformName,
      });
    }

    const privacyLevel =
      readString(content.extra, "privacy_level") || DEFAULT_PRIVACY_LEVEL;
    if (!VALID_PRIVACY_LEVELS.has(privacyLevel)) {
      throw new PublishError(`Invalid TikTok privacy_level: ${privacyLevel}`, {
        platform: this.platformName,
      });
    }

    if (content.mediaUrls?.[0]) {
      return this.publishPullFromUrl(accessToken, content, privacyLevel);
    }
    if (content.mediaFiles?.[0]) {
      return this.publishFileUpload(accessToken, content, privacyLevel);
    }
    throw new PublishError("No video source provided for TikTok", {
      platform: this.platformName,
    });
  }

  private async publishPullFromUrl(
    accessToken: string,
    content: PublishContent,
    privacyLevel: string
  ): Promise<PublishResult> {
    const body = await this.requestJson<JsonRecord>(
      "POST",
      `${API_BASE}/post/publish/video/init/`,
      {
        accessToken,
        json: {
          post_info: this.postInfo(content, privacyLevel),
          source_info: {
            source: "PULL_FROM_URL",
            video_url: content.mediaUrls?.[0],
          },
        },
      }
    );
    const data = readRecord(body, "data");
    return { platformPostId: readString(data, "publish_id"), extra: data };
  }

  private async publishFileUpload(
    accessToken: string,
    content: PublishContent,
    privacyLevel: string
  ): Promise<PublishResult> {
    const videoPath = content.mediaFiles?.[0] ?? "";
    const videoSize = (await stat(videoPath)).size;
    const body = await this.requestJson<JsonRecord>(
      "POST",
      `${API_BASE}/post/publish/video/init/`,
      {
        accessToken,
        json: {
          post_info: this.postInfo(content, privacyLevel),
          source_info: {
            source: "FILE_UPLOAD",
            video_size: videoSize,
            chunk_size: videoSize,
            total_chunk_count: 1,
          },
        },
      }
    );
    const data = readRecord(body, "data");
    const uploadUrl = readString(data, "upload_url");
    if (!uploadUrl) {
      throw new PublishError("TikTok did not return an upload_url", {
        platform: this.platformName,
        rawResponse: data,
      });
    }

    const bytes = new Uint8Array(await readFile(videoPath));
    await this.request("PUT", uploadUrl, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.byteLength),
        "Content-Range": `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
      },
      body: toArrayBuffer(bytes),
      timeoutMs: 120_000,
    });
    return { platformPostId: readString(data, "publish_id"), extra: data };
  }

  private postInfo(content: PublishContent, privacyLevel: string): JsonRecord {
    return {
      title: (content.title || content.text || "").slice(0, this.maxCaptionLength),
      privacy_level: privacyLevel,
    };
  }

  private clientKey(): string {
    return this.credential("client_key", "clientId", "client_id", "appId", "app_id");
  }
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

function pkceChallenge(verifier: string) {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}

function readString(source: unknown, key: string): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const value = (source as JsonRecord)[key];
  return typeof value === "string" ? value : "";
}

function readNumber(source: unknown, key: string): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const value = (source as JsonRecord)[key];
  return typeof value === "number" ? value : undefined;
}

export default TikTokProvider;
