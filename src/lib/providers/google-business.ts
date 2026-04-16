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
} from "./types";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const BUSINESS_INFO_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1";
const POSTS_API = "https://mybusiness.googleapis.com/v4";

type GoogleAccount = {
  name: string;
  accountName?: string;
};

type GoogleLocation = {
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
  };
  phoneNumbers?: {
    primaryPhone?: string;
  };
};

export class GoogleBusinessProvider extends OAuthProvider {
  platformName = "Google Business";
  authType: AuthType = "oauth2";
  maxCaptionLength = 1500;
  supportedPostTypes: PostType[] = ["text", "image"];
  supportedMediaTypes: MediaType[] = ["jpeg", "png"];
  requiredScopes = ["https://www.googleapis.com/auth/business.manage"];

  getAuthUrl(redirectUri: string, state: string): string {
    return buildAuthUrl(AUTH_URL, {
      client_id: this.clientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: this.requiredScopes.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
    });
  }

  async exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>("POST", TOKEN_URL, {
      form: {
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      },
    });
    return this.googleTokens(body);
  }

  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const body = await this.requestJson<Record<string, unknown>>("POST", TOKEN_URL, {
      form: {
        client_id: this.clientId(),
        client_secret: this.clientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      },
    });

    return {
      ...this.googleTokens(body),
      refreshToken,
    };
  }

  async revokeToken(accessToken: string): Promise<boolean> {
    try {
      await this.request("POST", REVOKE_URL, {
        params: { token: accessToken },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getProfile(accessToken: string): Promise<AccountProfile> {
    const accountName = await this.getAccountName(accessToken);
    const location = await this.getPrimaryLocation(accessToken, accountName);

    if (!location) {
      return {
        platformId: accountName,
        name: accountName,
      };
    }

    const addressLines = location.storefrontAddress?.addressLines ?? [];
    return {
      platformId: location.name,
      name: location.title ?? location.name,
      extra: {
        accountName,
        address: addressLines.join(", "),
        phone: location.phoneNumbers?.primaryPhone,
        raw: location as Record<string, unknown>,
      },
    };
  }

  async publishPost(
    accessToken: string,
    content: PublishContent
  ): Promise<PublishResult> {
    const text = content.text ?? "";
    if (text.length > this.maxCaptionLength) {
      throw new PublishError(
        `Post text exceeds ${this.maxCaptionLength} characters (got ${text.length})`,
        { platform: this.platformName }
      );
    }

    const accountName = await this.getAccountName(accessToken);
    const locationName = await this.getLocationName(accessToken, accountName);
    const parent = localPostsParent(accountName, locationName);
    const topicType = stringExtra(content.extra, "topicType", "topic_type") ?? "STANDARD";

    const body: Record<string, unknown> = {
      languageCode: stringExtra(content.extra, "languageCode", "language_code") ?? "en",
      summary: text,
      topicType,
    };

    const mediaUrls = content.mediaUrls ?? [];
    if (mediaUrls.length > 0) {
      body.media = mediaUrls.map((sourceUrl) => ({
        mediaFormat: "PHOTO",
        sourceUrl,
      }));
    }

    const event = recordExtra(content.extra, "event");
    if (topicType === "EVENT" && event) body.event = event;

    const offer = recordExtra(content.extra, "offer");
    if (topicType === "OFFER" && offer) body.offer = offer;

    const callToAction = recordExtra(content.extra, "callToAction", "call_to_action");
    if (callToAction) body.callToAction = callToAction;

    const result = await this.requestJson<Record<string, unknown>>(
      "POST",
      `${POSTS_API}/${parent}/localPosts`,
      {
        accessToken,
        json: body,
      }
    );

    return {
      platformPostId: typeof result.name === "string" ? result.name : "",
      url: typeof result.searchUrl === "string" ? result.searchUrl : undefined,
      extra: result,
    };
  }

  async getPostMetrics(accessToken: string, postId: string) {
    const body = await this.requestJson<Record<string, unknown>>(
      "GET",
      `${POSTS_API}/${postId}`,
      { accessToken }
    );

    return {
      impressions: 0,
      extra: body,
    };
  }

  private googleTokens(body: Record<string, unknown>): OAuthTokens {
    if (typeof body.error === "string") {
      throw new OAuthError(
        `Google token error: ${stringValue(body.error_description) ?? body.error}`,
        { platform: this.platformName, rawResponse: body }
      );
    }

    const accessToken = stringValue(body.access_token);
    if (!accessToken) {
      throw new OAuthError("Google token response missing access_token", {
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

  private async getAccountName(accessToken: string): Promise<string> {
    const configured = this.credentials.accountName ?? this.credentials.account_id;
    if (configured) return normalizeAccountName(configured);

    const body = await this.requestJson<{ accounts?: GoogleAccount[] }>(
      "GET",
      `${ACCOUNTS_API}/accounts`,
      { accessToken }
    );
    const account = body.accounts?.[0];
    if (!account?.name) {
      throw new PublishError("No Google Business accounts found", {
        platform: this.platformName,
      });
    }
    return normalizeAccountName(account.name);
  }

  private async getLocationName(
    accessToken: string,
    accountName: string
  ): Promise<string> {
    const configured =
      this.credentials.locationName ?? this.credentials.location_id;
    if (configured) return configured;

    const location = await this.getPrimaryLocation(accessToken, accountName);
    if (!location?.name) {
      throw new PublishError("No Google Business locations found", {
        platform: this.platformName,
      });
    }
    return location.name;
  }

  private async getPrimaryLocation(
    accessToken: string,
    accountName: string
  ): Promise<GoogleLocation | null> {
    const body = await this.requestJson<{ locations?: GoogleLocation[] }>(
      "GET",
      `${BUSINESS_INFO_API}/${accountName}/locations`,
      {
        accessToken,
        params: {
          readMask:
            "name,title,storefrontAddress,phoneNumbers,metadata,profile",
        },
      }
    );
    return body.locations?.[0] ?? null;
  }
}

function normalizeAccountName(value: string) {
  return value.startsWith("accounts/") ? value : `accounts/${value}`;
}

function localPostsParent(accountName: string, locationName: string) {
  if (locationName.startsWith("accounts/")) return locationName;
  if (locationName.startsWith("locations/")) {
    return `${accountName}/${locationName}`;
  }
  return `${accountName}/locations/${locationName}`;
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

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : undefined;
}
