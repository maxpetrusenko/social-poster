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

const AUTH_URL = "https://www.instagram.com/oauth/authorize";
const TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const API_BASE = "https://graph.instagram.com/v25.0";
const LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token";
const REFRESH_TOKEN_URL = "https://graph.instagram.com/refresh_access_token";
const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_MAX_ATTEMPTS = 60;

export class InstagramPersonalProvider extends OAuthProvider {
  platformName = "Instagram (Personal)";
  authType = "oauth2" as const;
  maxCaptionLength = 2200;
  supportedPostTypes: PostType[] = ["image", "carousel", "reel", "story"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4", "mov"];
  requiredScopes = [
    "instagram_business_basic",
    "instagram_business_content_publish",
    "instagram_business_manage_comments",
    "instagram_business_manage_messages",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 5000,
      publishPerDay: 100,
    };
  }

  getAuthUrl(redirectUri: string, state: string) {
    return buildAuthUrl(AUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(","),
      response_type: "code",
      enable_fb_login: "0",
      force_authentication: "1",
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
      throw new OAuthError(`Instagram token exchange failed: ${JSON.stringify(body)}`, {
        platform: this.platformName,
        rawResponse: body,
      });
    }

    return this.exchangeForLongLivedToken(shortLivedToken);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      REFRESH_TOKEN_URL,
      {
        params: {
          grant_type: "ig_refresh_token",
          access_token: refreshToken,
        },
      }
    );
    return this.longLivedTokenResult(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const body = await this.requestInstagramGraphJson<Record<string, unknown>>(
      "GET",
      `${API_BASE}/me`,
      {
        accessToken,
        params: {
          fields:
            "user_id,username,name,profile_picture_url,followers_count",
        },
      }
    );

    const platformId = stringValue(body.user_id) || stringValue(body.id);
    const username = optionalString(body.username);
    return {
      platformId,
      name: stringValue(body.name) || username || "",
      handle: username,
      avatarUrl: optionalString(body.profile_picture_url),
      followerCount: numberValue(body.followers_count),
      extra: body,
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const mediaUrls = content.mediaUrls ?? [];
    if (mediaUrls.length === 0) {
      throw new PublishError("Instagram requires at least one media item", {
        platform: this.platformName,
      });
    }

    if (content.postType === "carousel" && mediaUrls.length > 1) {
      return this.publishCarousel(accessToken, content, mediaUrls);
    }
    return this.publishSingle(accessToken, content, mediaUrls[0]);
  }

  private async exchangeForLongLivedToken(
    shortLivedToken: string
  ): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      LONG_LIVED_TOKEN_URL,
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: this.clientSecret(),
          access_token: shortLivedToken,
        },
      }
    );
    return this.longLivedTokenResult(body);
  }

  private longLivedTokenResult(body: Record<string, unknown>): OAuthTokens {
    const accessToken = optionalString(body.access_token);
    if (!accessToken) {
      throw new OAuthError(
        `Instagram long-lived token exchange failed: ${JSON.stringify(body)}`,
        { platform: this.platformName, rawResponse: body }
      );
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
    content: PublishContent,
    mediaUrl: string
  ) {
    const payload: Record<string, string> = {};
    if (content.text) payload.caption = content.text;

    if (content.postType === "reel") {
      payload.media_type = "REELS";
      payload.video_url = mediaUrl;
    } else if (content.postType === "story") {
      payload.media_type = "STORIES";
      if (isVideoUrl(mediaUrl)) {
        payload.video_url = mediaUrl;
      } else {
        payload.image_url = mediaUrl;
      }
    } else {
      payload.image_url = mediaUrl;
    }

    const containerId = await this.createContainer(accessToken, payload);
    await this.waitForContainer(accessToken, containerId);
    return this.publishContainer(accessToken, containerId);
  }

  private async publishCarousel(
    accessToken: string,
    content: PublishContent,
    mediaUrls: string[]
  ) {
    const childIds: string[] = [];
    for (const url of mediaUrls) {
      const childPayload: Record<string, string | boolean> = {
        is_carousel_item: true,
      };
      if (isVideoUrl(url)) {
        childPayload.media_type = "VIDEO";
        childPayload.video_url = url;
      } else {
        childPayload.image_url = url;
      }

      const childId = await this.createContainer(accessToken, childPayload);
      await this.waitForContainer(accessToken, childId);
      childIds.push(childId);
    }

    const carouselPayload: Record<string, string> = {
      media_type: "CAROUSEL",
      children: childIds.join(","),
    };
    if (content.text) carouselPayload.caption = content.text;

    const carouselId = await this.createContainer(accessToken, carouselPayload);
    await this.waitForContainer(accessToken, carouselId);
    return this.publishContainer(accessToken, carouselId);
  }

  private async createContainer(
    accessToken: string,
    payload: Record<string, string | boolean>
  ) {
    const body = await this.requestInstagramGraphJson<Record<string, unknown>>(
      "POST",
      `${API_BASE}/me/media`,
      { accessToken, json: payload }
    );
    const containerId = optionalString(body.id);
    if (!containerId) {
      throw new PublishError("Failed to create Instagram media container", {
        platform: this.platformName,
        rawResponse: body,
      });
    }
    return containerId;
  }

  private async waitForContainer(accessToken: string, containerId: string) {
    for (let attempt = 0; attempt < CONTAINER_POLL_MAX_ATTEMPTS; attempt += 1) {
      const body = await this.requestInstagramGraphJson<Record<string, unknown>>(
        "GET",
        `${API_BASE}/${containerId}`,
        { accessToken, params: { fields: "status_code,status" } }
      );
      const status = stringValue(body.status_code);
      if (status === "FINISHED") return;
      if (status === "ERROR") {
        throw new PublishError(
          `Instagram container failed: ${stringValue(body.status) || "unknown error"}`,
          { platform: this.platformName, rawResponse: body }
        );
      }
      await sleep(CONTAINER_POLL_INTERVAL_MS);
    }

    throw new PublishError("Instagram container processing timed out", {
      platform: this.platformName,
    });
  }

  private async publishContainer(
    accessToken: string,
    containerId: string
  ): Promise<PublishResult> {
    const body = await this.requestInstagramGraphJson<Record<string, unknown>>(
      "POST",
      `${API_BASE}/me/media_publish`,
      { accessToken, json: { creation_id: containerId } }
    );
    const mediaId = stringValue(body.id);
    return {
      platformPostId: mediaId,
      url: mediaId ? `https://www.instagram.com/p/${mediaId}/` : undefined,
      extra: body,
    };
  }

  private requestInstagramGraphJson<T>(
    method: string,
    url: string,
    options: {
      accessToken?: string;
      params?: Record<string, string | number | boolean | undefined | null>;
      json?: unknown;
    } = {}
  ) {
    const { accessToken, params, ...rest } = options;
    return this.requestJson<T>(method, url, {
      ...rest,
      params: {
        ...(params ?? {}),
        ...(accessToken ? { access_token: accessToken } : {}),
      },
    });
  }
}

function isVideoUrl(url: string) {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".mov");
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function numberOrUndefined(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default InstagramPersonalProvider;
