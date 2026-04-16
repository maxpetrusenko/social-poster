import { APIError, PublishError } from "./errors";
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

const BASE_URL = "https://graph.facebook.com/v21.0";
const OAUTH_URL = "https://www.facebook.com/v21.0/dialog/oauth";
const TOKEN_URL = `${BASE_URL}/oauth/access_token`;
const CONTAINER_POLL_INTERVAL_MS = 2000;
const CONTAINER_POLL_MAX_ATTEMPTS = 60;

export class InstagramProvider extends OAuthProvider {
  platformName = "Instagram";
  authType = "oauth2" as const;
  maxCaptionLength = 2200;
  supportedPostTypes: PostType[] = ["image", "carousel", "reel", "story"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4", "mov"];
  requiredScopes = [
    "instagram_basic",
    "instagram_content_publish",
    "instagram_manage_comments",
    "instagram_manage_insights",
    "pages_show_list",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 5000,
      publishPerDay: 100,
      extra: { publishedPostsPer24h: 100 },
    };
  }

  getAuthUrl(redirectUri: string, state: string) {
    return buildAuthUrl(OAUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      state,
      scope: this.requiredScopes.join(","),
      response_type: "code",
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>("POST", TOKEN_URL, {
      params: {
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
      },
    });
    return this.tokenToResult(body);
  }

  async refreshToken(shortLivedToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>("GET", TOKEN_URL, {
      params: {
        grant_type: "fb_exchange_token",
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        fb_exchange_token: shortLivedToken,
      },
    });
    return this.tokenToResult(body);
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const igUserId = await this.getIgUserId(accessToken);
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${BASE_URL}/${igUserId}`,
      {
        accessToken,
        params: {
          fields: "id,username,name,profile_picture_url,followers_count",
        },
      }
    );

    return {
      platformId: stringValue(body.id),
      name: stringValue(body.name),
      handle: optionalString(body.username),
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

    const igUserId = extraString(content, "ig_user_id", "igUserId")
      ?? (await this.getIgUserId(accessToken));

    if (content.postType === "carousel" && mediaUrls.length > 1) {
      return this.publishCarousel(accessToken, igUserId, content, mediaUrls);
    }
    return this.publishSingle(accessToken, igUserId, content, mediaUrls[0]);
  }

  private async publishSingle(
    accessToken: string,
    igUserId: string,
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

    const containerId = await this.createContainer(accessToken, igUserId, payload);
    await this.waitForContainer(accessToken, containerId);
    return this.publishContainer(accessToken, igUserId, containerId);
  }

  private async publishCarousel(
    accessToken: string,
    igUserId: string,
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

      const childId = await this.createContainer(accessToken, igUserId, childPayload);
      await this.waitForContainer(accessToken, childId);
      childIds.push(childId);
    }

    const carouselPayload: Record<string, string> = {
      media_type: "CAROUSEL",
      children: childIds.join(","),
    };
    if (content.text) carouselPayload.caption = content.text;

    const carouselId = await this.createContainer(
      accessToken,
      igUserId,
      carouselPayload
    );
    await this.waitForContainer(accessToken, carouselId);
    return this.publishContainer(accessToken, igUserId, carouselId);
  }

  private async createContainer(
    accessToken: string,
    igUserId: string,
    payload: Record<string, string | boolean>
  ) {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${BASE_URL}/${igUserId}/media`,
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
      const body = await this.requestJson<Record<string, unknown>>(
        "GET",
        `${BASE_URL}/${containerId}`,
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
    igUserId: string,
    containerId: string
  ): Promise<PublishResult> {
    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${BASE_URL}/${igUserId}/media_publish`,
      { accessToken, json: { creation_id: containerId } }
    );
    const mediaId = stringValue(body.id);
    return {
      platformPostId: mediaId,
      url: mediaId ? `https://www.instagram.com/p/${mediaId}/` : undefined,
      extra: body,
    };
  }

  private async getIgUserId(accessToken: string) {
    const configured = optionalString(this.credentials.ig_user_id)
      ?? optionalString(this.credentials.igUserId);
    if (configured) return configured;

    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${BASE_URL}/me/accounts`,
      {
        accessToken,
        params: { fields: "id,instagram_business_account" },
      }
    );

    const pages = Array.isArray(body.data) ? body.data : [];
    for (const item of pages) {
      const account = recordValue(recordValue(item).instagram_business_account);
      const id = optionalString(account.id);
      if (id) return id;
    }

    throw new APIError(
      "No Instagram Business Account found linked to any Facebook Page",
      { platform: this.platformName, rawResponse: body }
    );
  }
}

function isVideoUrl(url: string) {
  const lowerUrl = url.toLowerCase();
  return lowerUrl.endsWith(".mp4") || lowerUrl.endsWith(".mov");
}

function extraString(content: PublishContent, ...keys: string[]) {
  const extra = recordValue(content.extra);
  for (const key of keys) {
    const value = optionalString(extra[key]);
    if (value) return value;
  }
  return undefined;
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

function numberValue(value: unknown) {
  return typeof value === "number" ? value : 0;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default InstagramProvider;
