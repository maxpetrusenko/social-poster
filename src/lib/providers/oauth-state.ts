export type NativeOAuthState = {
  nonce: string;
  platform: string;
  profileId?: string | null;
  methodId?: string | null;
  next?: string | null;
};

export const NATIVE_OAUTH_COOKIE = "sp_native_oauth";

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
