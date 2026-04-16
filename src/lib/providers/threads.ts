import { OAuthError, PublishError } from "./errors";
import { OAuthProvider, buildAuthUrl } from "./oauth";
import type {
  AccountProfile,
  MediaType,
  OAuthTokens,
  PostType,
  PublishContent,
  PublishResult,
  RateLimitConfig,
} from "./types";

const AUTH_URL = "https://threads.net/oauth/authorize";
const TOKEN_URL = "https://graph.threads.net/oauth/access_token";
const API_BASE = "https://graph.threads.net/v1.0";

export class ThreadsProvider extends OAuthProvider {
  platformName = "Threads";
  authType = "oauth2" as const;
  maxCaptionLength = 500;
  supportedPostTypes: PostType[] = ["text", "image", "video", "carousel"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "mp4", "mov"];
  requiredScopes = [
    "threads_basic",
    "threads_content_publish",
    "threads_manage_insights",
    "threads_manage_replies",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 5000,
      publishPerDay: 250,
    };
  }

  getAuthUrl(redirectUri: string, state: string) {
    return buildAuthUrl(AUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(","),
      response_type: "code",
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>("POST", TOKEN_URL, {
      form: {
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      },
    });
    const shortLivedToken = optionalString(body.access_token);
    if (!shortLivedToken) {
      throw new OAuthError(`Threads token exchange failed: ${JSON.stringify(body)}`, {
        platform: this.platformName,
        rawResponse: body,
      });
    }

    return this.exchangeForLongLivedToken(shortLivedToken);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${API_BASE}/refresh_access_token`,
      {
        params: {
          grant_type: "th_refresh_token",
          access_token: refreshToken,
        },
      }
    );
    return this.longLivedTokenResult(body, "Threads token refresh failed");
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${API_BASE}/me`,
      {
        accessToken,
        params: {
          fields: "id,username,name,threads_profile_picture_url,threads_biography",
        },
      }
    );

    return {
      platformId: stringValue(body.id),
      name: stringValue(body.name),
      handle: optionalString(body.username),
      avatarUrl: optionalString(body.threads_profile_picture_url),
      extra: { ...body, biography: body.threads_biography },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const userId =
      extraString(content, "user_id", "userId") ??
      (await this.getProfile(accessToken)).platformId;

    if (!userId) {
      throw new PublishError("Could not determine Threads user_id", {
        platform: this.platformName,
      });
    }

    const mediaUrls = content.mediaUrls ?? [];
    if (content.postType === "carousel") {
      return this.publishCarousel(accessToken, userId, content, mediaUrls);
    }
    return this.publishSingle(accessToken, userId, content, mediaUrls[0]);
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string
  ): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${API_BASE}/access_token`,
      {
        params: {
          grant_type: "th_exchange_token",
          client_secret: this.clientSecret(),
          access_token: shortLivedToken,
        },
      }
    );
    return this.longLivedTokenResult(
      body,
      "Threads long-lived token exchange failed"
    );
  }

  private longLivedTokenResult(
    body: Record<string, unknown>,
    failureMessage: string
  ): OAuthTokens {
    const accessToken = optionalString(body.access_token);
    if (!accessToken) {
      throw new OAuthError(`${failureMessage}: ${JSON.stringify(body)}`, {
        platform: this.platformName,
        rawResponse: body,
      });
    }

    return {
      accessToken,
      refreshToken: accessToken,
      expiresIn: numberOrUndefined(body.expires_in),
      tokenType: optionalString(body.token_type) ?? "Bearer",
      scope: optionalString(body.scope),
      raw: body,
    };
  }

  private async publishSingle(
    accessToken: string,
    userId: string,
    content: PublishContent,
    mediaUrl?: string
  ): Promise<PublishResult> {
    const payload: Record<string, string> = {
      text: (content.text || "").slice(0, this.maxCaptionLength),
    };

    if (content.postType === "image" && mediaUrl) {
      payload.media_type = "IMAGE";
      payload.image_url = mediaUrl;
    } else if (content.postType === "video" && mediaUrl) {
      payload.media_type = "VIDEO";
      payload.video_url = mediaUrl;
    } else {
      payload.media_type = "TEXT";
    }

    const replyToId = extraString(content, "reply_to_id", "replyToId");
    if (replyToId) payload.reply_to_id = replyToId;

    const creationId = await this.createThreadContainer(
      accessToken,
      userId,
      payload
    );
    return this.publishContainer(accessToken, userId, creationId);
  }

  private async publishCarousel(
    accessToken: string,
    userId: string,
    content: PublishContent,
    mediaUrls: string[]
  ): Promise<PublishResult> {
    if (mediaUrls.length === 0) {
      throw new PublishError("Threads carousel requires at least one media item", {
        platform: this.platformName,
      });
    }

    const children: string[] = [];
    for (const url of mediaUrls) {
      const payload: Record<string, string> = {
        is_carousel_item: "true",
      };
      if (isVideoUrl(url)) {
        payload.media_type = "VIDEO";
        payload.video_url = url;
      } else {
        payload.media_type = "IMAGE";
        payload.image_url = url;
      }
      children.push(await this.createThreadContainer(accessToken, userId, payload));
    }

    const creationId = await this.createThreadContainer(accessToken, userId, {
      media_type: "CAROUSEL",
      children: children.join(","),
      text: (content.text || "").slice(0, this.maxCaptionLength),
    });
    return this.publishContainer(accessToken, userId, creationId);
  }

  private async createThreadContainer(
    accessToken: string,
    userId: string,
    payload: Record<string, string>
  ) {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${API_BASE}/${userId}/threads`,
      { accessToken, form: payload }
    );
    const creationId = optionalString(body.id);
    if (!creationId) {
      throw new PublishError(`Threads container creation failed: ${JSON.stringify(body)}`, {
        platform: this.platformName,
        rawResponse: body,
      });
    }
    return creationId;
  }

  private async publishContainer(
    accessToken: string,
    userId: string,
    creationId: string
  ): Promise<PublishResult> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${API_BASE}/${userId}/threads_publish`,
      { accessToken, form: { creation_id: creationId } }
    );
    const threadId = stringValue(body.id);
    return {
      platformPostId: threadId,
      extra: body,
    };
  }
}

function extraString(content: PublishContent, ...keys: string[]) {
  const extra = recordValue(content.extra);
  for (const key of keys) {
    const value = optionalString(extra[key]);
    if (value) return value;
  }
  return undefined;
}

function isVideoUrl(url: string) {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".mov");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

export default ThreadsProvider;
