import type { ProviderCredentials } from "./base";

export function credentialsFromEnv(platform: string): ProviderCredentials {
  switch (platform) {
    case "facebook":
    case "instagram":
    case "instagram_personal":
      return {
        appId:
          process.env.META_APP_ID ??
          process.env.PLATFORM_FACEBOOK_APP_ID ??
          process.env.PLATFORM_INSTAGRAM_APP_ID,
        clientId:
          process.env.META_APP_ID ??
          process.env.PLATFORM_FACEBOOK_APP_ID ??
          process.env.PLATFORM_INSTAGRAM_APP_ID,
        appSecret:
          process.env.META_APP_SECRET ??
          process.env.PLATFORM_FACEBOOK_APP_SECRET ??
          process.env.PLATFORM_INSTAGRAM_APP_SECRET,
        clientSecret:
          process.env.META_APP_SECRET ??
          process.env.PLATFORM_FACEBOOK_APP_SECRET ??
          process.env.PLATFORM_INSTAGRAM_APP_SECRET,
      };
    case "threads":
      return {
        clientId:
          process.env.THREADS_APP_ID ??
          process.env.META_APP_ID ??
          process.env.PLATFORM_FACEBOOK_APP_ID,
        clientSecret:
          process.env.THREADS_APP_SECRET ??
          process.env.META_APP_SECRET ??
          process.env.PLATFORM_FACEBOOK_APP_SECRET,
      };
    case "linkedin":
    case "linkedin_personal":
    case "linkedin_company":
      return {
        clientId:
          process.env.LINKEDIN_CLIENT_ID ?? process.env.PLATFORM_LINKEDIN_CLIENT_ID,
        clientSecret:
          process.env.LINKEDIN_CLIENT_SECRET ??
          process.env.PLATFORM_LINKEDIN_CLIENT_SECRET,
      };
    case "tiktok":
      return {
        clientId:
          process.env.TIKTOK_CLIENT_KEY ?? process.env.PLATFORM_TIKTOK_CLIENT_KEY,
        clientSecret:
          process.env.TIKTOK_CLIENT_SECRET ??
          process.env.PLATFORM_TIKTOK_CLIENT_SECRET,
      };
    case "youtube":
      return {
        clientId:
          process.env.YOUTUBE_CLIENT_ID ?? process.env.PLATFORM_GOOGLE_CLIENT_ID,
        clientSecret:
          process.env.YOUTUBE_CLIENT_SECRET ?? process.env.PLATFORM_GOOGLE_CLIENT_SECRET,
      };
    case "pinterest":
      return {
        clientId:
          process.env.PINTEREST_CLIENT_ID ?? process.env.PLATFORM_PINTEREST_APP_ID,
        clientSecret:
          process.env.PINTEREST_CLIENT_SECRET ??
          process.env.PLATFORM_PINTEREST_APP_SECRET,
      };
    case "google_business":
      return {
        clientId:
          process.env.GOOGLE_BUSINESS_CLIENT_ID ??
          process.env.PLATFORM_GOOGLE_CLIENT_ID,
        clientSecret:
          process.env.GOOGLE_BUSINESS_CLIENT_SECRET ??
          process.env.PLATFORM_GOOGLE_CLIENT_SECRET,
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
