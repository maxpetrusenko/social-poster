import crypto from "node:crypto";

export type NativeOAuthState = {
  nonce: string;
  platform: string;
  profileId?: string | null;
  methodId?: string | null;
  next?: string | null;
  timestamp?: number;
};

export const NATIVE_OAUTH_COOKIE = "sp_native_oauth";

export type NativeOAuthCookie = {
  nonce: string;
  codeVerifier?: string | null;
  redirectUri?: string | null;
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
      redirectUri:
        typeof parsed.redirectUri === "string" ? parsed.redirectUri : null,
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

export function signOAuthState(payload: NativeOAuthState): string {
  const data = JSON.stringify(payload);
  const secret =
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-oauth-secret";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");
  return `${Buffer.from(data).toString("base64url")}.${sig}`;
}

export function verifyOAuthState(
  signed: string,
  maxAgeMs = 600_000
): NativeOAuthState | null {
  const dotIdx = signed.lastIndexOf(".");
  if (dotIdx < 1) return null;
  const dataB64 = signed.slice(0, dotIdx);
  const sig = signed.slice(dotIdx + 1);
  if (!dataB64 || !sig) return null;

  const data = Buffer.from(dataB64, "base64url").toString("utf8");
  const secret =
    process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "dev-oauth-secret";
  const expected = crypto
    .createHmac("sha256", secret)
    .update(data)
    .digest("base64url");

  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as NativeOAuthState;
    if (parsed.timestamp && Date.now() - parsed.timestamp > maxAgeMs) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Build the OAuth callback URL from the live request.
 * Uses a single shared `/api/auth/callback` path — the shim route
 * extracts the platform from signed state and routes internally.
 * This keeps portal whitelists simple (one URI per domain).
 */
export function oauthCallbackUrl(
  platform: string,
  request: { headers: Headers; url?: string }
): string {
  const proto =
    request.headers.get("x-forwarded-proto") ??
    (request.url?.startsWith("https") ? "https" : null);
  const host =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "localhost:3000";
  const callbackProto =
    proto ?? (isLoopbackHost(stripPort(host)) ? "http" : "https");
  const requestOrigin = `${callbackProto}://${host}`;
  const platformOverride = resolvePlatformOAuthCallbackOverride(
    platform,
    requestOrigin
  );
  if (platformOverride) return platformOverride;

  const override = resolveOAuthCallbackOverride(
    process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL,
    requestOrigin
  );

  return override ?? `${requestOrigin}/api/auth/callback`;
}

function resolvePlatformOAuthCallbackOverride(
  platform: string,
  requestOrigin: string
) {
  const normalized = platform.trim().toLowerCase();
  const explicit =
    normalized === "twitter" || normalized === "x"
      ? process.env.SOCIAL_POSTER_TWITTER_CALLBACK_URL ||
        process.env.TWITTER_CALLBACK_URL ||
        process.env.X_CALLBACK_URL
      : null;
  const explicitValue = resolveOAuthCallbackOverride(explicit, requestOrigin);
  if (explicitValue) return explicitValue;

  if (normalized !== "twitter" && normalized !== "x") return null;

  try {
    const appUrl = new URL(requestOrigin);
    if (appUrl.protocol === "https:" && isLoopbackHost(appUrl.hostname)) {
      return "http://127.0.0.1:3001/api/auth/callback";
    }
  } catch {
    return null;
  }

  return null;
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

function stripPort(host: string) {
  return host.toLowerCase().replace(/:\d+$/, "");
}
