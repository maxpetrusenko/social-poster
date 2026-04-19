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

const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_BASE = "https://api.linkedin.com";
const USERINFO_URL = `${API_BASE}/v2/userinfo`;
const LINKEDIN_HEADERS = {
  "LinkedIn-Version": "202401",
  "X-Restli-Protocol-Version": "2.0.0",
};

type JsonRecord = Record<string, unknown>;

export class LinkedInProvider extends OAuthProvider {
  platformName = "LinkedIn";
  authType = "oauth2" as const;
  maxCaptionLength = 3000;
  supportedPostTypes: PostType[] = [
    "text",
    "image",
    "video",
    "link",
    "article",
    "poll",
  ];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4"];
  requiredScopes = [
    "openid",
    "profile",
    "email",
    "w_member_social",
    "w_organization_social",
    "r_organization_social",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 100,
      publishPerDay: 100,
      extra: { memberPostsPerDay: 100, companySharesPerDay: 100 },
    };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(AUTH_URL, {
      response_type: "code",
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(" "),
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<JsonRecord>("POST", TOKEN_URL, {
      form: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
      },
    });
    return this.tokenToResult(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const data = await this.requestJson<JsonRecord>("GET", USERINFO_URL, {
      accessToken,
      headers: LINKEDIN_HEADERS,
    });
    return {
      platformId: readString(data, "sub"),
      name: readString(data, "name") || readString(data, "given_name"),
      avatarUrl: readString(data, "picture") || undefined,
      extra: data,
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const author = await this.resolveAuthor(accessToken, content);
    const postType = content.postType ?? "text";

    if (postType === "image" && firstMedia(content)) {
      return this.publishMediaPost(accessToken, author, content, "images", "image");
    }
    if (postType === "video" && firstMedia(content)) {
      return this.publishMediaPost(accessToken, author, content, "videos", "video");
    }
    if (postType === "article" || postType === "link" || content.linkUrl) {
      return this.publishArticlePost(accessToken, author, content);
    }
    if (postType === "poll") {
      return this.publishPollPost(accessToken, author, content);
    }
    return this.publishTextPost(accessToken, author, content);
  }

  protected async resolveAuthor(
    accessToken: string,
    content: PublishContent
  ): Promise<string> {
    const author = readString(content.extra, "author");
    if (author) return author;
    const profile = await this.getProfile(accessToken);
    return `urn:li:person:${profile.platformId}`;
  }

  private buildPostBody(author: string, commentary: string): JsonRecord {
    return {
      author,
      commentary,
      visibility: "PUBLIC",
      distribution: {
        feedDistribution: "MAIN_FEED",
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: "PUBLISHED",
    };
  }

  private async publishTextPost(
    accessToken: string,
    author: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const body = this.buildPostBody(author, content.text);
    return this.createPost(accessToken, body);
  }

  private async publishArticlePost(
    accessToken: string,
    author: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const body = this.buildPostBody(author, content.text);
    body.content = {
      article: {
        source: content.linkUrl ?? "",
        title: content.title ?? "",
        description: content.description ?? "",
      },
    };
    return this.createPost(accessToken, body);
  }

  private async publishPollPost(
    accessToken: string,
    author: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const options = readStringArray(content.extra, "poll_options");
    if (options.length === 0) {
      throw new PublishError("poll_options required in content.extra", {
        platform: this.platformName,
      });
    }

    const body = this.buildPostBody(author, content.text);
    body.content = {
      poll: {
        question: readString(content.extra, "poll_question") || content.text,
        options: options.map((text) => ({ text })),
        settings: {
          duration: readString(content.extra, "poll_duration") || "THREE_DAYS",
        },
      },
    };
    return this.createPost(accessToken, body);
  }

  private async publishMediaPost(
    accessToken: string,
    author: string,
    content: PublishContent,
    endpoint: "images" | "videos",
    responseKey: "image" | "video"
  ): Promise<PublishResult> {
    const init = await this.requestJson<JsonRecord>(
      "POST",
      `${API_BASE}/rest/${endpoint}`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
        params: { action: "initializeUpload" },
        json: { initializeUploadRequest: { owner: author } },
      }
    );
    const value = readRecord(init, "value");
    const uploadUrl = readString(value, "uploadUrl");
    const assetUrn = readString(value, responseKey);
    if (!uploadUrl || !assetUrn) {
      throw new PublishError(`Failed to initialize LinkedIn ${responseKey} upload`, {
        platform: this.platformName,
        rawResponse: value,
      });
    }

    await this.uploadBinary(accessToken, uploadUrl, firstMedia(content) ?? "");
    const body = this.buildPostBody(author, content.text);
    body.content = { media: { id: assetUrn } };
    const result = await this.createPost(accessToken, body);
    return { ...result, extra: { ...result.extra, [`${responseKey}Urn`]: assetUrn } };
  }

  private async createPost(
    accessToken: string,
    body: JsonRecord
  ): Promise<PublishResult> {
    const response = await this.request("POST", `${API_BASE}/rest/posts`, {
      accessToken,
      headers: LINKEDIN_HEADERS,
      json: body,
    });
    const postUrn = response.headers.get("x-restli-id") ?? "";
    return {
      platformPostId: postUrn,
      url: postUrn ? `https://www.linkedin.com/feed/update/${postUrn}/` : undefined,
      extra: { urn: postUrn },
    };
  }

  private async uploadBinary(
    accessToken: string,
    uploadUrl: string,
    source: string
  ) {
    const bytes = await readBytes(source);
    await this.request("PUT", uploadUrl, {
      accessToken,
      headers: {
        ...LINKEDIN_HEADERS,
        "Content-Type": "application/octet-stream",
      },
      body: toArrayBuffer(bytes),
      timeoutMs: 120_000,
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

function firstMedia(content: PublishContent): string | undefined {
  return content.mediaFiles?.[0] ?? content.mediaUrls?.[0];
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function readRecord(source: unknown, key: string): JsonRecord {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  const value = (source as JsonRecord)[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
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

export default LinkedInProvider;
