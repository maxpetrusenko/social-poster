import type { ProviderCredentials } from "./base";

export function credentialsFromEnv(platform: string): ProviderCredentials {
  switch (platform) {
    case "twitter":
    case "x":
      return {
        clientId: envValue(
          "SOCIAL_POSTER_TWITTER_CLIENT_ID",
          "NATIVE_TWITTER_CLIENT_ID",
          "TWITTER_CLIENT_ID",
          "X_CLIENT_ID",
          "PLATFORM_TWITTER_CLIENT_ID"
        ),
        clientSecret: envValue(
          "SOCIAL_POSTER_TWITTER_CLIENT_SECRET",
          "NATIVE_TWITTER_CLIENT_SECRET",
          "TWITTER_CLIENT_SECRET",
          "X_CLIENT_SECRET",
          "PLATFORM_TWITTER_CLIENT_SECRET"
        ),
      };
    case "facebook":
      return {
        appId: envValue("META_APP_ID", "PLATFORM_FACEBOOK_APP_ID"),
        clientId: envValue("META_APP_ID", "PLATFORM_FACEBOOK_APP_ID"),
        appSecret: envValue("META_APP_SECRET", "PLATFORM_FACEBOOK_APP_SECRET"),
        clientSecret: envValue("META_APP_SECRET", "PLATFORM_FACEBOOK_APP_SECRET"),
      };
    case "instagram":
      // Facebook Login path — uses the Facebook/Meta app ID
      return {
        appId: envValue("META_APP_ID", "PLATFORM_FACEBOOK_APP_ID"),
        clientId: envValue("META_APP_ID", "PLATFORM_FACEBOOK_APP_ID"),
        appSecret: envValue("META_APP_SECRET", "PLATFORM_FACEBOOK_APP_SECRET"),
        clientSecret: envValue("META_APP_SECRET", "PLATFORM_FACEBOOK_APP_SECRET"),
      };
    case "instagram_personal":
      // Instagram Business Login — uses the Instagram app ID
      return {
        clientId: envValue("PLATFORM_INSTAGRAM_APP_ID", "META_APP_ID"),
        clientSecret: envValue("PLATFORM_INSTAGRAM_APP_SECRET", "META_APP_SECRET"),
      };
    case "threads":
      return {
        clientId: envValue(
          "THREADS_APP_ID",
          "META_APP_ID",
          "PLATFORM_FACEBOOK_APP_ID"
        ),
        clientSecret: envValue(
          "THREADS_APP_SECRET",
          "META_APP_SECRET",
          "PLATFORM_FACEBOOK_APP_SECRET"
        ),
      };
    case "linkedin":
    case "linkedin_personal":
    case "linkedin_company":
      return {
        clientId: envValue("LINKEDIN_CLIENT_ID", "PLATFORM_LINKEDIN_CLIENT_ID"),
        clientSecret: envValue(
          "LINKEDIN_CLIENT_SECRET",
          "PLATFORM_LINKEDIN_CLIENT_SECRET"
        ),
      };
    case "tiktok":
      return {
        clientId: envValue("TIKTOK_CLIENT_KEY", "PLATFORM_TIKTOK_CLIENT_KEY"),
        clientSecret: envValue(
          "TIKTOK_CLIENT_SECRET",
          "PLATFORM_TIKTOK_CLIENT_SECRET"
        ),
      };
    case "youtube":
      return {
        clientId: envValue(
          "YOUTUBE_CLIENT_ID",
          "PLATFORM_GOOGLE_CLIENT_ID",
          "GOOGLE_AUTH_CLIENT_ID"
        ),
        clientSecret: envValue(
          "YOUTUBE_CLIENT_SECRET",
          "PLATFORM_GOOGLE_CLIENT_SECRET",
          "GOOGLE_AUTH_CLIENT_SECRET"
        ),
      };
    case "pinterest":
      return {
        clientId: envValue("PINTEREST_CLIENT_ID", "PLATFORM_PINTEREST_APP_ID"),
        clientSecret: envValue(
          "PINTEREST_CLIENT_SECRET",
          "PLATFORM_PINTEREST_APP_SECRET"
        ),
      };
    case "google_business":
      return {
        clientId: envValue(
          "GOOGLE_BUSINESS_CLIENT_ID",
          "PLATFORM_GOOGLE_CLIENT_ID",
          "GOOGLE_AUTH_CLIENT_ID"
        ),
        clientSecret: envValue(
          "GOOGLE_BUSINESS_CLIENT_SECRET",
          "PLATFORM_GOOGLE_CLIENT_SECRET",
          "GOOGLE_AUTH_CLIENT_SECRET"
        ),
      };
    default:
      return {};
  }
}

export function credentialsFromConfig(
  config: Record<string, unknown> | null | undefined
): ProviderCredentials {
  const credentials =
    config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
      ? (config.credentials as Record<string, unknown>)
      : {};

  const result: ProviderCredentials = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string") {
      result[key] = value;
    }
  }

  return result;
}

export function mergeProviderCredentials(
  platform: string,
  config: Record<string, unknown> | null | undefined
): ProviderCredentials {
  return {
    ...credentialsFromEnv(platform),
    ...credentialsFromConfig(config),
  };
}

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export function readAccessToken(
  config: Record<string, unknown> | null | undefined
) {
  const credentials =
    config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
      ? (config.credentials as Record<string, unknown>)
      : {};

  const accessToken = credentials.accessToken;
  return typeof accessToken === "string" && accessToken.trim()
    ? accessToken.trim()
    : null;
}

export function readRefreshToken(
  config: Record<string, unknown> | null | undefined
) {
  const credentials =
    config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
      ? (config.credentials as Record<string, unknown>)
      : {};

  const refreshToken = credentials.refreshToken;
  return typeof refreshToken === "string" && refreshToken.trim()
    ? refreshToken.trim()
    : null;
}

export function readTokenExpiresAt(
  config: Record<string, unknown> | null | undefined
) {
  const credentials =
    config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
      ? (config.credentials as Record<string, unknown>)
      : {};

  const expiresAt = credentials.expiresAt;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) {
    return expiresAt;
  }
  if (typeof expiresAt === "string" && expiresAt.trim()) {
    const parsed = Number(expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function readTokenLastRefreshedAt(
  config: Record<string, unknown> | null | undefined
) {
  const credentials =
    config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
      ? (config.credentials as Record<string, unknown>)
      : {};

  const lastRefreshedAt = credentials.lastRefreshedAt;
  if (typeof lastRefreshedAt === "number" && Number.isFinite(lastRefreshedAt)) {
    return lastRefreshedAt;
  }
  if (typeof lastRefreshedAt === "string" && lastRefreshedAt.trim()) {
    const parsed = Number(lastRefreshedAt);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}
