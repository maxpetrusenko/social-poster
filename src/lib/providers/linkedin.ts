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
const LINKEDIN_API_VERSION = process.env.LINKEDIN_API_VERSION?.trim() || "202604";
const LINKEDIN_HEADERS = {
  "LinkedIn-Version": LINKEDIN_API_VERSION,
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
    let result: PublishResult;

    if (postType === "image" && firstMedia(content)) {
      result = await this.publishMediaPost(accessToken, author, content, "images", "image");
    } else if (postType === "video" && firstMedia(content)) {
      result = await this.publishMediaPost(accessToken, author, content, "videos", "video");
    } else if (postType === "article" || postType === "link" || content.linkUrl) {
      result = await this.publishArticlePost(accessToken, author, content);
    } else if (postType === "poll") {
      result = await this.publishPollPost(accessToken, author, content);
    } else {
      result = await this.publishTextPost(accessToken, author, content);
    }

    if (content.firstComment?.trim() && result.platformPostId) {
      const comment = await this.createComment(
        accessToken,
        author,
        result.platformPostId,
        content.firstComment
      );
      result = {
        ...result,
        extra: {
          ...result.extra,
          firstComment: comment,
        },
      };
    }

    return result;
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
    const mediaSource = firstMedia(content) ?? "";
    const bytes = await readBytes(mediaSource);
    const initializeUploadRequest: JsonRecord = { owner: author };
    if (endpoint === "videos") {
      initializeUploadRequest.fileSizeBytes = bytes.byteLength;
    }

    const init = await this.requestJson<JsonRecord>(
      "POST",
      `${API_BASE}/rest/${endpoint}`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
        params: { action: "initializeUpload" },
        json: { initializeUploadRequest },
      }
    );
    const value = readRecord(init, "value");
    const assetUrn = readString(value, responseKey);
    if (!assetUrn) {
      throw new PublishError(`Failed to initialize LinkedIn ${responseKey} upload`, {
        platform: this.platformName,
        rawResponse: value,
      });
    }

    if (endpoint === "videos") {
      const uploadedPartIds = await this.uploadVideoParts(
        readUploadInstructions(value),
        bytes
      );
      await this.finalizeVideoUpload(
        accessToken,
        assetUrn,
        readString(value, "uploadToken"),
        uploadedPartIds
      );
    } else {
      const uploadUrl = readString(value, "uploadUrl");
      if (!uploadUrl) {
        throw new PublishError(`Failed to initialize LinkedIn ${responseKey} upload`, {
          platform: this.platformName,
          rawResponse: value,
        });
      }
      await this.uploadBinary(accessToken, uploadUrl, bytes);
    }

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

  private async createComment(
    accessToken: string,
    author: string,
    postUrn: string,
    text: string
  ) {
    const body = await this.requestJson<JsonRecord>(
      "POST",
      `${API_BASE}/rest/socialActions/${encodeURIComponent(postUrn)}/comments`,
      {
        accessToken,
        headers: LINKEDIN_HEADERS,
        json: {
          actor: author,
          object: postUrn,
          message: { text },
        },
      }
    );
    return {
      id: readString(body, "commentUrn") || readString(body, "id"),
      raw: body,
    };
  }

  async deletePost(accessToken: string, platformPostId: string) {
    const encodedPostId = encodeURIComponent(platformPostId);
    await this.request("DELETE", `${API_BASE}/rest/posts/${encodedPostId}`, {
      accessToken,
      headers: LINKEDIN_HEADERS,
    });

    return {
      deleted: true,
      extra: { urn: platformPostId },
    };
  }

  private async uploadBinary(
    accessToken: string | null,
    uploadUrl: string,
    bytes: Uint8Array
  ) {
    await this.request("PUT", uploadUrl, {
      accessToken: accessToken ?? undefined,
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: toArrayBuffer(bytes),
      timeoutMs: 120_000,
    });
  }

  private async uploadVideoParts(
    instructions: UploadInstruction[],
    bytes: Uint8Array
  ) {
    if (instructions.length === 0) {
      throw new PublishError("LinkedIn video upload returned no upload instructions", {
        platform: this.platformName,
      });
    }

    const uploadedPartIds: string[] = [];
    for (const instruction of instructions) {
      const part = bytes.slice(instruction.firstByte, instruction.lastByte + 1);
      const response = await this.request("PUT", instruction.uploadUrl, {
        headers: { "Content-Type": "application/octet-stream" },
        body: toArrayBuffer(part),
        timeoutMs: 120_000,
      });
      const etag = response.headers.get("etag")?.replace(/^"|"$/g, "");
      if (!etag) {
        throw new PublishError("LinkedIn video part upload did not return an ETag", {
          platform: this.platformName,
        });
      }
      uploadedPartIds.push(etag);
    }

    return uploadedPartIds;
  }

  private async finalizeVideoUpload(
    accessToken: string,
    video: string,
    uploadToken: string,
    uploadedPartIds: string[]
  ) {
    await this.request("POST", `${API_BASE}/rest/videos`, {
      accessToken,
      headers: LINKEDIN_HEADERS,
      params: { action: "finalizeUpload" },
      json: {
        finalizeUploadRequest: {
          video,
          uploadToken,
          uploadedPartIds,
        },
      },
    });
  }
}

type UploadInstruction = {
  uploadUrl: string;
  firstByte: number;
  lastByte: number;
};

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

function readUploadInstructions(source: JsonRecord): UploadInstruction[] {
  const value = source.uploadInstructions;
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as JsonRecord;
    const uploadUrl = readString(record, "uploadUrl");
    const firstByte = readNumber(record, "firstByte");
    const lastByte = readNumber(record, "lastByte");
    return uploadUrl && firstByte !== null && lastByte !== null
      ? [{ uploadUrl, firstByte, lastByte }]
      : [];
  });
}

function readNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const value = (source as JsonRecord)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
