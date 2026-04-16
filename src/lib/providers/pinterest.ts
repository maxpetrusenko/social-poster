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

const AUTH_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const API_BASE = process.env.PINTEREST_API_BASE ?? "https://api.pinterest.com/v5";

type JsonRecord = Record<string, unknown>;

export class PinterestProvider extends OAuthProvider {
  platformName = "Pinterest";
  authType = "oauth2" as const;
  maxCaptionLength = 500;
  supportedPostTypes: PostType[] = ["pin"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4"];
  requiredScopes = ["user_accounts:read", "boards:read", "pins:read", "pins:write"];

  get rateLimits(): RateLimitConfig {
    return { requestsPerHour: 1000, requestsPerDay: 24000, publishPerDay: 25 };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(AUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(","),
      response_type: "code",
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      headers: this.basicAuthHeader(),
      form: {
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      headers: this.basicAuthHeader(),
      form: { refresh_token: refreshToken, grant_type: "refresh_token" },
    });
    const result = this.tokenToResult(body);
    return { ...result, refreshToken: result.refreshToken ?? refreshToken };
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestJson<JsonRecord>(
      "GET",
      `${API_BASE}/user_account`,
      { accessToken }
    );
    return {
      platformId: readString(body, "id"),
      name: readString(body, "business_name") || readString(body, "username"),
      handle: readString(body, "username") || undefined,
      avatarUrl: readString(body, "profile_image") || undefined,
      followerCount: readNumber(body, "follower_count"),
      extra: body,
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const boardId = readString(content.extra, "board_id");
    if (!boardId) {
      throw new PublishError("board_id is required in content.extra", {
        platform: this.platformName,
      });
    }

    const payload: JsonRecord = {
      board_id: boardId,
      description: (content.description || content.text || "").slice(
        0,
        this.maxCaptionLength
      ),
    };
    if (content.title) payload.title = content.title.slice(0, 100);
    if (content.linkUrl) payload.link = content.linkUrl;

    const altText = readString(content.extra, "alt_text");
    if (altText) payload.alt_text = altText.slice(0, 500);

    if (readBoolean(content.extra, "is_video") || content.postType === "video") {
      return this.publishVideoPin(accessToken, content, payload);
    }

    if (content.mediaUrls?.[0]) {
      payload.media_source = {
        source_type: "image_url",
        url: content.mediaUrls[0],
      };
    } else if (content.mediaFiles?.[0]) {
      throw new PublishError(
        "Pinterest image file upload is not supported; use hosted mediaUrls",
        { platform: this.platformName }
      );
    } else {
      throw new PublishError("No media provided for Pinterest pin", {
        platform: this.platformName,
      });
    }

    return this.createPin(accessToken, payload);
  }

  private async publishVideoPin(
    accessToken: string,
    content: PublishContent,
    payload: JsonRecord
  ): Promise<PublishResult> {
    const mediaBody = await this.requestJson<JsonRecord>("POST", `${API_BASE}/media`, {
      accessToken,
      json: { media_type: "video" },
    });
    const mediaId = readString(mediaBody, "media_id");
    const uploadUrl = readString(mediaBody, "upload_url");
    if (!mediaId) {
      throw new PublishError("Pinterest did not return a media_id", {
        platform: this.platformName,
        rawResponse: mediaBody,
      });
    }

    if (uploadUrl && content.mediaFiles?.[0]) {
      const bytes = new Uint8Array(await readFile(content.mediaFiles[0]));
      await this.request("PUT", uploadUrl, {
        headers: { "Content-Type": "video/mp4" },
        body: toArrayBuffer(bytes),
        timeoutMs: 120_000,
      });
    }

    payload.media_source = { source_type: "video_id", media_id: mediaId };
    return this.createPin(accessToken, payload);
  }

  private async createPin(
    accessToken: string,
    payload: JsonRecord
  ): Promise<PublishResult> {
    const body = await this.requestJson<JsonRecord>("POST", `${API_BASE}/pins`, {
      accessToken,
      json: payload,
    });
    const pinId = readString(body, "id");
    return {
      platformPostId: pinId,
      url: pinId ? `https://www.pinterest.com/pin/${pinId}/` : undefined,
      extra: body,
    };
  }

  private basicAuthHeader(): Record<string, string> {
    const token = Buffer.from(`${this.clientId()}:${this.clientSecret()}`).toString(
      "base64"
    );
    return { Authorization: `Basic ${token}` };
  }
}

function readString(source: unknown, key: string): string {
  if (!source || typeof source !== "object" || Array.isArray(source)) return "";
  const value = (source as JsonRecord)[key];
  return typeof value === "string" ? value : "";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readBoolean(source: unknown, key: string): boolean {
  if (!source || typeof source !== "object" || Array.isArray(source)) return false;
  const value = (source as JsonRecord)[key];
  return typeof value === "boolean" ? value : false;
}

function readNumber(source: unknown, key: string): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const value = (source as JsonRecord)[key];
  return typeof value === "number" ? value : undefined;
}

export default PinterestProvider;
