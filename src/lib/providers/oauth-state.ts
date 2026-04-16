export type NativeOAuthState = {
  nonce: string;
  platform: string;
  profileId?: string | null;
  methodId?: string | null;
  next?: string | null;
};

export const NATIVE_OAUTH_COOKIE = "sp_native_oauth";

export type NativeOAuthCookie = {
  nonce: string;
  codeVerifier?: string | null;
  credentials?: {
    clientId?: string;
    clientSecret?: string;
  } | null;
};

export function encodeNativeOAuthState(state: NativeOAuthState) {
  return Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
}

export function decodeNativeOAuthState(value: string | null): NativeOAuthState | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    if (typeof parsed.nonce !== "string" || typeof parsed.platform !== "string") {
      return null;
    }

    return {
      nonce: parsed.nonce,
      platform: parsed.platform,
      profileId:
        typeof parsed.profileId === "string" ? parsed.profileId : null,
      methodId: typeof parsed.methodId === "string" ? parsed.methodId : null,
      next: typeof parsed.next === "string" ? parsed.next : null,
    };
  } catch {
    return null;
  }
}

export function encodeNativeOAuthCookie(cookie: NativeOAuthCookie) {
  return Buffer.from(JSON.stringify(cookie), "utf8").toString("base64url");
}

export function decodeNativeOAuthCookie(value: string | null): NativeOAuthCookie | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    if (typeof parsed.nonce !== "string") return null;

    return {
      nonce: parsed.nonce,
      codeVerifier:
        typeof parsed.codeVerifier === "string" ? parsed.codeVerifier : null,
      credentials: readCookieCredentials(parsed.credentials),
    };
  } catch {
    return { nonce: value, codeVerifier: null };
  }
}

function readCookieCredentials(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const clientId =
    typeof source.clientId === "string" && source.clientId.trim()
      ? source.clientId.trim()
      : undefined;
  const clientSecret =
    typeof source.clientSecret === "string" && source.clientSecret.trim()
      ? source.clientSecret.trim()
      : undefined;

  return clientId || clientSecret ? { clientId, clientSecret } : null;
}

export function normalizeRoutePlatform(platform: string) {
  return platform.trim().toLowerCase().replace(/-/g, "_");
}

export function routePlatformPath(platform: string) {
  return platform.replace(/_/g, "-");
}

export function storedPlatformType(platform: string) {
  return platform;
}

export function oauthCallbackPath(platform: string) {
  if (platform === "linkedin_personal" || platform === "linkedin_company") {
    return `/social-accounts/callback/${platform}/`;
  }

  return `/api/auth/${routePlatformPath(platform)}/callback`;
}

export function oauthCallbackUrl(platform: string, appUrl: string) {
  if (platform === "twitter" || platform === "x") {
    return (
      process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL?.trim() ||
      process.env.TWITTER_OAUTH_CALLBACK_URL?.trim() ||
      "https://social.maxpetrusenko.com/api/auth/twitter/callback"
    );
  }

  if (platform === "linkedin" || platform === "linkedin_personal") {
    return (
      process.env.SOCIAL_POSTER_LINKEDIN_PERSONAL_CALLBACK_URL?.trim() ||
      process.env.LINKEDIN_OAUTH_CALLBACK_URL?.trim() ||
      new URL(oauthCallbackPath("linkedin_personal"), appUrl).toString()
    );
  }

  if (platform === "linkedin_company") {
    return (
      process.env.SOCIAL_POSTER_LINKEDIN_COMPANY_CALLBACK_URL?.trim() ||
      process.env.LINKEDIN_COMPANY_OAUTH_CALLBACK_URL?.trim() ||
      new URL(oauthCallbackPath(platform), appUrl).toString()
    );
  }

  return new URL(oauthCallbackPath(platform), appUrl).toString();
}
