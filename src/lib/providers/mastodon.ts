import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { OAuthError, PublishError } from "./errors";
import { OAuthProvider } from "./oauth";
import { buildAuthUrl } from "./oauth";
import type {
  AccountProfile,
  AuthType,
  MediaType,
  OAuthTokens,
  PostType,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

const DEFAULT_MAX_CHARS = 500;

type MastodonAccount = {
  id: string;
  username?: string;
  acct?: string;
  display_name?: string;
  avatar?: string;
  followers_count?: number;
};

type MastodonStatus = {
  id: string;
  url?: string;
};

type MastodonApp = {
  client_id: string;
  client_secret: string;
};

export class MastodonProvider extends OAuthProvider {
  platformName = "Mastodon";
  authType: AuthType = "instance_oauth";
  maxCaptionLength = DEFAULT_MAX_CHARS;
  supportedPostTypes: PostType[] = ["text", "image", "video", "poll"];
  supportedMediaTypes: MediaType[] = [
    "jpeg",
    "png",
    "gif",
    "mp4",
    "mov",
    "webp",
  ];
  requiredScopes = ["read", "write", "follow"];

  private instanceUrl: string;

  constructor(credentials = {}) {
    super(credentials);
    const creds = credentials as Record<string, string | undefined>;
    this.instanceUrl = normalizeInstanceUrl(
      creds.instanceUrl ?? creds.instance_url ?? ""
    );
  }

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 100,
      requestsPerDay: 7200,
      publishPerDay: 100,
      extra: { publishPer3h: 300 },
    };
  }

  async registerApp(instanceUrl: string, redirectUri: string) {
    const normalized = normalizeInstanceUrl(instanceUrl);
    const body = await this.requestJson<MastodonApp>(
      "POST",
      `${normalized}/api/v1/apps`,
      {
        json: {
          client_name: "Social Poster",
          redirect_uris: redirectUri,
          scopes: this.requiredScopes.join(" "),
          website: "https://social.maxpetrusenko.com",
        },
      }
    );

    return {
      clientId: body.client_id,
      clientSecret: body.client_secret,
      instanceUrl: normalized,
      raw: body as Record<string, unknown>,
    };
  }

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(`${this.requireInstanceUrl()}/oauth/authorize`, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      scope: this.requiredScopes.join(" "),
      response_type: "code",
      state,
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${this.requireInstanceUrl()}/oauth/token`,
      {
        form: {
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          scope: this.requiredScopes.join(" "),
        },
      }
    );
    return this.mastodonTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${this.requireInstanceUrl()}/oauth/token`,
      {
        form: {
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          refresh_token: refreshToken,
          grant_type: "refresh_token",
          scope: this.requiredScopes.join(" "),
        },
      }
    );

    return {
      ...this.mastodonTokens(body),
      refreshToken: stringValue(body.refresh_token) ?? refreshToken,
    };
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    try {
      await this.request("POST", `${this.requireInstanceUrl()}/oauth/revoke`, {
        form: {
          client_id: this.clientId(),
          client_secret: this.clientSecret(),
          token: accessToken,
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getInstanceMaxChars(accessToken: string): Promise<number> {
    try {
      const body = await this.requestJson<Record<string, unknown>>(
        "GET",
        `${this.requireInstanceUrl()}/api/v2/instance`,
        { accessToken }
      );
      const configuration = recordValue(body.configuration);
      const statuses = recordValue(configuration?.statuses);
      return numberValue(statuses?.max_characters) ?? DEFAULT_MAX_CHARS;
    } catch {
      return DEFAULT_MAX_CHARS;
    }
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const account = await this.requestJson<MastodonAccount>(
      "GET",
      `${this.requireInstanceUrl()}/api/v1/accounts/verify_credentials`,
      { accessToken }
    );

    return {
      platformId: account.id,
      name: account.display_name || account.username || account.acct || account.id,
      handle: account.acct,
      avatarUrl: account.avatar,
      followerCount: account.followers_count ?? 0,
      extra: {
        username: account.username,
        instanceUrl: this.instanceUrl,
        raw: account as Record<string, unknown>,
      },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const text = content.text ?? "";
    const maxChars = await this.getInstanceMaxChars(accessToken);
    if (text.length > maxChars) {
      throw new PublishError(
        `Post text exceeds ${maxChars} characters (got ${text.length})`,
        { platform: this.platformName }
      );
    }

    const mediaIds = [];
    const media = await collectMedia(content);
    for (const item of media) {
      mediaIds.push(await this.uploadMedia(accessToken, item));
    }

    const params = new URLSearchParams();
    if (text) params.set("status", text);
    for (const mediaId of mediaIds) params.append("media_ids[]", mediaId);
    params.set("visibility", stringExtra(content.extra, "visibility") ?? "public");

    const spoilerText = stringExtra(content.extra, "spoilerText", "spoiler_text");
    if (spoilerText) params.set("spoiler_text", spoilerText);

    const replyId = stringExtra(content.extra, "inReplyToId", "in_reply_to_id");
    if (replyId) params.set("in_reply_to_id", replyId);

    if (content.postType === "poll") {
      appendPoll(params, recordExtra(content.extra, "poll"));
    }

    const status = await this.requestBodyJson<MastodonStatus>(
      "POST",
      `${this.requireInstanceUrl()}/api/v1/statuses`,
      {
        accessToken,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      }
    );

    return {
      platformPostId: status.id,
      url: status.url,
      extra: status as Record<string, unknown>,
    };
  }

  async publishComment(accessToken: string, postId: string, text: string) {
    const params = new URLSearchParams();
    params.set("status", text);
    params.set("in_reply_to_id", postId);
    params.set("visibility", "public");

    const status = await this.requestBodyJson<MastodonStatus>(
      "POST",
      `${this.requireInstanceUrl()}/api/v1/statuses`,
      {
        accessToken,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      }
    );

    return {
      platformCommentId: status.id,
      extra: status as Record<string, unknown>,
    };
  }

  async getPostMetrics(accessToken: string, postId: string) {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${this.requireInstanceUrl()}/api/v1/statuses/${postId}`,
      { accessToken }
    );

    const likes = numberValue(body.favourites_count) ?? 0;
    const shares = numberValue(body.reblogs_count) ?? 0;
    const comments = numberValue(body.replies_count) ?? 0;
    return {
      likes,
      shares,
      comments,
      engagements: likes + shares + comments,
      extra: body,
    };
  }

  private async uploadMedia(accessToken: string, media: MediaItem) {
    const form = new FormData();
    form.append("file", media.blob, media.filename);
    if (media.description) form.append("description", media.description);

    const body = await this.requestBodyJson<Record<string, unknown>>(
      "POST",
      `${this.requireInstanceUrl()}/api/v2/media`,
      {
        accessToken,
        body: form,
      }
    );

    const id = body.id;
    if (typeof id !== "string" || !id) {
      throw new PublishError("Mastodon media upload response missing id", {
        platform: this.platformName,
        rawResponse: body,
      });
    }
    return id;
  }

  private mastodonTokens(body: Record<string, unknown>): OAuthTokens {
    if (typeof body.error === "string") {
      throw new OAuthError(
        `Mastodon token error: ${stringValue(body.error_description) ?? body.error}`,
        { platform: this.platformName, rawResponse: body }
      );
    }

    const accessToken = stringValue(body.access_token);
    if (!accessToken) {
      throw new OAuthError("Mastodon token response missing access_token", {
        platform: this.platformName,
        rawResponse: body,
      });
    }

    return {
      accessToken,
      refreshToken: stringValue(body.refresh_token),
      expiresIn: numberValue(body.expires_in),
      tokenType: stringValue(body.token_type) ?? "Bearer",
      scope: stringValue(body.scope),
      raw: body,
    };
  }

  private requireInstanceUrl() {
    if (!this.instanceUrl) {
      throw new OAuthError("Mastodon missing instanceUrl credential", {
        platform: this.platformName,
      });
    }
    return this.instanceUrl;
  }

  private async requestBodyJson<T>(
    method: string,
    url: string,
    options: {
      accessToken?: string;
      headers?: Record<string, string>;
      body: BodyInit;
    }
  ): Promise<T> {
    const response = await this.request(method, url, options);
    return (await response.json()) as T;
  }
}

type MediaItem = {
  blob: Blob;
  mimeType: string;
  filename: string;
  description?: string;
};

async function collectMedia(content: PublishContent): Promise<MediaItem[]> {
  const items: MediaItem[] = [];
  const descriptions = stringArrayExtra(
    content.extra,
    "descriptions",
    "altTexts",
    "alt_texts"
  );

  for (const [index, file] of (content.mediaFiles ?? []).entries()) {
    const bytes = await readFile(file);
    const mimeType = mimeFromName(file);
    items.push({
      blob: new Blob([toArrayBuffer(bytes)], { type: mimeType }),
      mimeType,
      filename: basename(file),
      description: descriptions[index],
    });
  }

  for (const [index, url] of (content.mediaUrls ?? []).entries()) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new PublishError(`Failed to fetch Mastodon media URL: ${response.status}`, {
        platform: "Mastodon",
      });
    }
    const bytes = await response.arrayBuffer();
    const mimeType = response.headers.get("Content-Type") ?? mimeFromName(url);
    items.push({
      blob: new Blob([bytes], { type: mimeType }),
      mimeType,
      filename: basename(new URL(url).pathname) || "media",
      description: descriptions[index],
    });
  }

  return items;
}

function appendPoll(params: URLSearchParams, poll?: Record<string, unknown>) {
  const options = poll?.options;
  if (!Array.isArray(options)) return;

  for (const option of options) {
    if (typeof option === "string" && option) {
      params.append("poll[options][]", option);
    }
  }
  params.set("poll[expires_in]", String(numberValue(poll?.expires_in) ?? 86400));
  if (poll?.multiple === true) params.set("poll[multiple]", "true");
  if (poll?.hide_totals === true || poll?.hideTotals === true) {
    params.set("poll[hide_totals]", "true");
  }
}

function normalizeInstanceUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function stringExtra(
  extra: Record<string, unknown> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = extra?.[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function stringArrayExtra(
  extra: Record<string, unknown> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = extra?.[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }
  }
  return [];
}

function recordExtra(
  extra: Record<string, unknown> | undefined,
  ...keys: string[]
) {
  for (const key of keys) {
    const value = extra?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function mimeFromName(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "application/octet-stream";
}

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}
