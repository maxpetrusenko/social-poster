import { APIError, PublishError } from "./errors";
import { OAuthProvider } from "./oauth";
import { buildAuthUrl } from "./oauth";
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

type FacebookPage = {
  id: string;
  name: string;
  accessToken: string;
  category: string;
  picture?: string;
};

export class FacebookProvider extends OAuthProvider {
  platformName = "Facebook";
  authType = "oauth2" as const;
  maxCaptionLength = 63_206;
  supportedPostTypes: PostType[] = ["text", "image", "video", "link"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png", "gif", "mp4", "mov"];
  requiredScopes = [
    "business_management",
    "pages_show_list",
    "pages_manage_posts",
    "pages_read_engagement",
    "pages_read_user_content",
    "pages_manage_metadata",
    "pages_messaging",
  ];

  get rateLimits(): RateLimitConfig {
    return {
      requestsPerHour: 200,
      requestsPerDay: 4800,
      publishPerDay: 4800,
      extra: { postsPer24hPerPage: 4800 },
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
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${BASE_URL}/me`,
      {
        accessToken,
        params: { fields: "id,name,picture" },
      }
    );
    const picture = recordValue(recordValue(body.picture).data);

    return {
      platformId: stringValue(body.id),
      name: stringValue(body.name),
      avatarUrl: optionalString(picture.url),
      extra: body,
    };
  }

  async getUserPages(accessToken: string): Promise<FacebookPage[]> {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${BASE_URL}/me/accounts`,
      {
        accessToken,
        params: { fields: "id,name,access_token,category,picture" },
      }
    );
    if (body.error) {
      throw new APIError("Failed to fetch Facebook pages", {
        platform: this.platformName,
        rawResponse: body,
      });
    }

    const pages = Array.isArray(body.data) ? body.data : [];
    return pages.map((item) => {
      const page = recordValue(item);
      const picture = recordValue(recordValue(page.picture).data);
      return {
        id: stringValue(page.id),
        name: stringValue(page.name),
        accessToken: stringValue(page.access_token),
        category: stringValue(page.category),
        picture: optionalString(picture.url),
      };
    });
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const pageId = extraString(content, "page_id", "pageId");
    if (!pageId) {
      throw new PublishError(
        "page_id is required in content.extra for Facebook publishing",
        { platform: this.platformName }
      );
    }

    const mediaUrls = content.mediaUrls ?? [];
    if (content.postType === "image" && mediaUrls.length > 0) {
      return this.publishPhoto(accessToken, pageId, content, mediaUrls[0]);
    }
    if (content.postType === "video" && mediaUrls.length > 0) {
      return this.publishVideo(accessToken, pageId, content, mediaUrls[0]);
    }
    return this.publishTextOrLink(accessToken, pageId, content);
  }

  private async publishTextOrLink(
    accessToken: string,
    pageId: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const payload: Record<string, string> = { message: content.text };
    if (content.linkUrl) payload.link = content.linkUrl;

    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${BASE_URL}/${pageId}/feed`,
      { accessToken, json: payload }
    );
    const id = stringValue(body.id);
    return {
      platformPostId: id,
      url: id ? `https://www.facebook.com/${id}` : undefined,
      extra: body,
    };
  }

  private async publishPhoto(
    accessToken: string,
    pageId: string,
    content: PublishContent,
    mediaUrl: string
  ): Promise<PublishResult> {
    const payload: Record<string, string> = { url: mediaUrl };
    if (content.text) payload.message = content.text;

    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${BASE_URL}/${pageId}/photos`,
      { accessToken, json: payload }
    );
    const id = stringValue(body.id);
    const postId = stringValue(body.post_id) || id;
    return {
      platformPostId: id,
      url: postId ? `https://www.facebook.com/${postId}` : undefined,
      extra: body,
    };
  }

  private async publishVideo(
    accessToken: string,
    pageId: string,
    content: PublishContent,
    mediaUrl: string
  ): Promise<PublishResult> {
    const payload: Record<string, string> = { file_url: mediaUrl };
    if (content.text) payload.description = content.text;

    const body = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${BASE_URL}/${pageId}/videos`,
      { accessToken, json: payload }
    );
    const id = stringValue(body.id);
    return {
      platformPostId: id,
      url: id ? `https://www.facebook.com/${id}` : undefined,
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

export default FacebookProvider;
