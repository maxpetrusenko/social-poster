import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { getRequestAppUrl } from "@/lib/app-url";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import { upsertPlatformConnection } from "@/lib/platform-connections";
import { mergeProviderCredentials } from "@/lib/providers/credentials";
import { getDisabledNativeOAuthMessage } from "@/lib/providers/disabled-native-oauth";
import { FacebookProvider } from "@/lib/providers/facebook";
import { getProvider } from "@/lib/providers/registry";
import { sanitizeOAuthReturnPath } from "@/lib/safe-next-path";
import {
  type NativeOAuthState,
  decodeNativeOAuthCookie,
  encodeNativeOAuthCookie,
  findNativeOAuthCookieFlow,
  NATIVE_OAUTH_COOKIE,
  oauthCallbackUrl,
  removeNativeOAuthCookieFlow,
  storedPlatformType,
} from "@/lib/providers/oauth-state";

export async function handleNativeOAuthCallback(
  request: NextRequest,
  platform: string,
  state: NativeOAuthState | null = null
) {
  const appUrl = getRequestAppUrl(request);
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const cookieStore = await cookies();
  const oauthCookie = decodeNativeOAuthCookie(
    cookieStore.get(NATIVE_OAUTH_COOKIE)?.value ?? null
  );
  const oauthFlow = findNativeOAuthCookieFlow(oauthCookie, state?.nonce);

  const fallback = new URL(sanitizeOAuthReturnPath(state?.next), appUrl);
  const disabledOAuthMessage = getDisabledNativeOAuthMessage(platform);
  if (disabledOAuthMessage) {
    updateNativeOAuthCookie(cookieStore, oauthCookie, state?.nonce);
    fallback.searchParams.set("error", "instagram_personal_unavailable");
    return NextResponse.redirect(fallback);
  }

  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");

  if (error) {
    fallback.searchParams.set(
      "error",
      error === "access_denied" ? "access_denied" : "provider_error"
    );
    return NextResponse.redirect(fallback);
  }

  if (
    !code ||
    !state ||
    !oauthFlow ||
    state.platform !== platform
  ) {
    console.error(`[oauth-callback] ❌ State mismatch for ${platform}: code=${!!code}, state=${!!state}, nonceMatch=${Boolean(oauthFlow)}, platformMatch=${state?.platform === platform}`);
    fallback.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(fallback);
  }

  updateNativeOAuthCookie(cookieStore, oauthCookie, state.nonce);

  const type = storedPlatformType(platform);
  if (!isPlatformType(type)) {
    fallback.searchParams.set("error", "unsupported_platform");
    return NextResponse.redirect(fallback);
  }

  const redirectUri = oauthFlow.redirectUri ?? oauthCallbackUrl(platform, request);
  // Values that must never reach logs or redirect URLs.
  const secrets: string[] = [code];
  if (oauthFlow.codeVerifier) secrets.push(oauthFlow.codeVerifier);

  try {
    const providerConfig = mergeProviderCredentials(
      platform,
      oauthFlow.credentials ? { credentials: oauthFlow.credentials } : null
    );
    secrets.push(...collectSecretValues(providerConfig));
    const provider = getProvider(platform, providerConfig);
    const tokens = await provider
      .exchangeCode(code, redirectUri, oauthFlow.codeVerifier ?? undefined)
      .catch((exchangeError: unknown) => {
        console.error(
          `[oauth-callback] ${platform} token exchange failed: ${redactSecrets(
            exchangeError instanceof Error ? exchangeError.message : "unknown",
            secrets
          )}`
        );
        throw new OAuthCallbackError("token_rejected");
      });
    if (platform === "facebook" && provider instanceof FacebookProvider) {
      return saveFacebookPageConnections({
        request,
        provider,
        tokens,
        state,
        tenant,
        fallback,
      });
    }

    secrets.push(tokens.accessToken);
    if (tokens.refreshToken) secrets.push(tokens.refreshToken);

    const profile = await getCallbackProfile(provider, platform, tokens.accessToken);
    if (platform === "instagram" && !profile?.platformId) {
      // Without the account id we cannot upsert, and a token that cannot read
      // /me is unusable. Refuse instead of saving a junk duplicate row.
      throw new OAuthCallbackError("instagram_profile_unreadable");
    }
    const now = new Date();
    const expiresAt = tokens.expiresIn
      ? now.getTime() + tokens.expiresIn * 1000
      : null;

    const result = await upsertPlatformConnection({
      workspaceId: tenant.currentWorkspace.id,
      name: profile?.name ?? `${provider.platformName} Connection`,
      type,
      handle: profile?.handle ?? null,
      accountId: profile?.platformId ?? null,
      provider: "direct",
      enabled: true,
      config: {
        profileId: state.profileId ?? null,
        authMethod: callbackAuthMethod(platform, state.methodId),
        credentials: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          expiresAt,
          tokenType: tokens.tokenType ?? "Bearer",
          scope: tokens.scope ?? null,
        },
        providerProfile: profile,
        profileRefresh: {
          checkedAt: now.toISOString(),
          avatarChangedAt: profile?.avatarUrl ? now.toISOString() : null,
        },
        notes: "Connected through native OAuth callback.",
      },
      now,
    });

    fallback.searchParams.set("connected", platform);
    fallback.searchParams.set("platformId", result.id);
    console.log(`[oauth-callback] ✅ ${result.created ? "Saved" : "Updated"} ${platform} connection for workspace ${tenant.currentWorkspace.id}`);

    // Cancel "connect account" drip if user just connected their first platform
    try {
      const { cancelDripIfDone } = await import("@/lib/marketing/drip");
      cancelDripIfDone(tenant.user.id, "welcome_2_connect");
    } catch { /* non-critical */ }

    return NextResponse.redirect(fallback);
  } catch (callbackError) {
    const message = redactSecrets(
      callbackError instanceof Error
        ? callbackError.message
        : "Native OAuth callback failed.",
      secrets
    );
    console.error(`[oauth-callback] ❌ ${platform} callback failed: ${message}`);
    fallback.searchParams.set(
      "error",
      callbackError instanceof OAuthCallbackError
        ? callbackError.code
        : "callback_failed"
    );
    return NextResponse.redirect(fallback);
  }
}

class OAuthCallbackError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function saveFacebookPageConnections({
  provider,
  tokens,
  state,
  tenant,
  fallback,
}: {
  request: NextRequest;
  provider: FacebookProvider;
  tokens: Awaited<ReturnType<FacebookProvider["exchangeCode"]>>;
  state: NativeOAuthState;
  tenant: Exclude<Awaited<ReturnType<typeof requireApiWorkspaceManager>>, NextResponse>;
  fallback: URL;
}) {
  const pages = await provider.getUserPages(tokens.accessToken);
  if (pages.length === 0) {
    fallback.searchParams.set("error", "facebook_no_pages");
    return NextResponse.redirect(fallback);
  }

  const now = new Date();
  const userTokenExpiresAt = tokens.expiresIn
    ? now.getTime() + tokens.expiresIn * 1000
    : null;

  let created = 0;
  let updated = 0;

  for (const page of pages) {
    const result = await upsertPlatformConnection({
      workspaceId: tenant.currentWorkspace.id,
      name: page.name || "Facebook Page",
      type: "facebook",
      handle: page.name || null,
      accountId: page.id,
      provider: "direct",
      enabled: true,
      config: {
        profileId: state.profileId ?? null,
        authMethod: state.methodId ?? "facebook_native",
        credentials: {
          accessToken: page.accessToken,
          pageAccessToken: page.accessToken,
          userAccessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken ?? null,
          userTokenExpiresAt,
          tokenType: tokens.tokenType ?? "Bearer",
          scope: tokens.scope ?? null,
        },
        providerProfile: {
          platformId: page.id,
          name: page.name,
          handle: page.name,
          avatarUrl: page.picture,
          extra: {
            category: page.category,
          },
        },
        facebookPage: {
          id: page.id,
          name: page.name,
          category: page.category,
          picture: page.picture,
        },
        profileRefresh: {
          checkedAt: now.toISOString(),
          avatarChangedAt: page.picture ? now.toISOString() : null,
        },
        notes: "Connected through native Facebook OAuth callback.",
      },
      now,
    });

    if (result.created) created += 1;
    else updated += 1;
  }

  fallback.searchParams.set("connected", "facebook");
  fallback.searchParams.set("pages", String(pages.length));
  console.log(
    `[oauth-callback] ✅ Saved Facebook Page connections for workspace ${tenant.currentWorkspace.id}: created=${created}, updated=${updated}`
  );

  try {
    const { cancelDripIfDone } = await import("@/lib/marketing/drip");
    cancelDripIfDone(tenant.user.id, "welcome_2_connect");
  } catch {
    /* non-critical */
  }

  return NextResponse.redirect(fallback);
}

/** One canonical authMethod per platform so /api/auth/instagram and the UI flow store the same value. */
function callbackAuthMethod(platform: string, methodId: string | null | undefined) {
  if (platform === "instagram") return "instagram_oauth";
  return methodId ?? `${platform}_native`;
}

/** Every string under a key containing "secret" (client/app secrets), any depth. */
function collectSecretValues(value: unknown, depth = 0): string[] {
  if (!value || typeof value !== "object" || depth > 3) return [];
  const out: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && /secret/i.test(key)) out.push(child);
    else out.push(...collectSecretValues(child, depth + 1));
  }
  return out;
}

function redactSecrets(message: string, secrets: string[]) {
  let out = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out;
}

async function getCallbackProfile(
  provider: ReturnType<typeof getProvider>,
  platform: string,
  accessToken: string
) {
  try {
    return await provider.getProfile(accessToken);
  } catch (error) {
    if (platform === "linkedin_company") {
      throw error;
    }
    return null;
  }
}

function isPlatformType(value: string): value is PlatformType {
  return (PLATFORM_TYPES as readonly string[]).includes(value);
}

function updateNativeOAuthCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  oauthCookie: ReturnType<typeof decodeNativeOAuthCookie>,
  nonce: string | null | undefined
) {
  const remainingOAuthCookie = removeNativeOAuthCookieFlow(oauthCookie, nonce);
  if (remainingOAuthCookie) {
    cookieStore.set(
      NATIVE_OAUTH_COOKIE,
      encodeNativeOAuthCookie(remainingOAuthCookie),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60,
        path: "/",
      }
    );
  } else {
    cookieStore.delete(NATIVE_OAUTH_COOKIE);
  }
}
