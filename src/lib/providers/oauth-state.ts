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
  void platform;
  return "/api/auth/callback";
}

export function oauthCallbackUrl(platform: string, appUrl: string) {
  const override = resolveOAuthCallbackOverride(
    process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL,
    appUrl
  );
  if (override) return applyCallbackRules(platform, override);

  const base = new URL(oauthCallbackPath(platform), appUrl).toString();
  return applyCallbackRules(platform, base);
}

/**
 * Apply per-platform callback URL rules from the platform's connection config.
 * Falls back to no-op if the platform has no rules defined.
 */
function applyCallbackRules(platform: string, url: string) {
  try {
    // Dynamic import would create circular deps; use lazy require pattern
    const { getConnectionDefinition } = require("@/platforms/registry") as {
      getConnectionDefinition: (type: string) => { oauthCallbackRules?: import("@/platforms/_shared/connection-config").OAuthCallbackRules } | undefined;
    };
    const def = getConnectionDefinition(platform);
    const rules = def?.oauthCallbackRules;
    if (!rules) return url;

    const parsed = new URL(url);
    if (!isLoopbackHost(parsed.hostname)) return url;

    if (rules.noLoopback) {
      // Platform rejects all loopback — return as-is, caller will show error
      return url;
    }
    if (rules.rewriteLocalhostTo127 && parsed.hostname === "localhost") {
      parsed.hostname = "127.0.0.1";
    }
    if (rules.requireHttps) {
      parsed.protocol = "https:";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function resolveOAuthCallbackOverride(
  override: string | null | undefined,
  appUrl: string | null | undefined
) {
  const value = override?.trim();
  if (!value) return null;

  try {
    const overrideUrl = new URL(value);
    const appOrigin = new URL(appUrl ?? "").origin;
    const appUrlObject = new URL(appOrigin);

    if (overrideUrl.origin === appUrlObject.origin) {
      return value;
    }

    if (isLoopbackHost(appUrlObject.hostname)) {
      return isLoopbackHost(overrideUrl.hostname) ? value : null;
    }

    return null;
  } catch {
    return null;
  }
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]"
  );
}
