import crypto from "node:crypto";
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

type JsonRecord = Record<string, unknown>;

export class TwitterProvider extends OAuthProvider {
  platformName = "Twitter/X";
  authType = "oauth2" as const;
  maxCaptionLength = 280;
  supportedPostTypes: PostType[] = ["text"];
  supportedMediaTypes: MediaType[] = [];
  requiredScopes = [
    "tweet.read",
    "tweet.write",
    "users.read",
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
    if ((content.mediaUrls?.length ?? 0) > 0 || (content.mediaFiles?.length ?? 0) > 0) {
      throw new PublishError("Twitter/X native OAuth currently supports text posts only", {
        platform: this.platformName,
      });
    }

    const body = await this.requestJson<JsonRecord>("POST", TWEETS_URL, {
      accessToken,
      json: { text: content.text },
    });
    const data = readRecord(body, "data");
    const id = readString(data, "id");

    return {
      platformPostId: id,
      url: id ? `https://x.com/i/web/status/${id}` : undefined,
      extra: body,
    };
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
