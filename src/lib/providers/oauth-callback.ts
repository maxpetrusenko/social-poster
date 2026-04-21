import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { getRequestAppUrl } from "@/lib/app-url";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import { upsertPlatformConnection } from "@/lib/platform-connections";
import { mergeProviderCredentials } from "@/lib/providers/credentials";
import { getProvider } from "@/lib/providers/registry";
import {
  type NativeOAuthState,
  decodeNativeOAuthCookie,
  NATIVE_OAUTH_COOKIE,
  oauthCallbackUrl,
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
  cookieStore.delete(NATIVE_OAUTH_COOKIE);

  const fallback = new URL(
    state?.next || "/dashboard/workspace-settings/social-accounts",
    appUrl
  );
  const error = request.nextUrl.searchParams.get("error");
  const code = request.nextUrl.searchParams.get("code");

  if (error) {
    fallback.searchParams.set("error", error);
    return NextResponse.redirect(fallback);
  }

  if (
    !code ||
    !state ||
    state.nonce !== oauthCookie?.nonce ||
    state.platform !== platform
  ) {
    console.error(`[oauth-callback] ❌ State mismatch for ${platform}: code=${!!code}, state=${!!state}, nonceMatch=${state?.nonce === oauthCookie?.nonce}, platformMatch=${state?.platform === platform}`);
    fallback.searchParams.set("error", "Invalid OAuth callback state.");
    return NextResponse.redirect(fallback);
  }

  const type = storedPlatformType(platform);
  if (!isPlatformType(type)) {
    fallback.searchParams.set("error", `Unsupported platform: ${type}`);
    return NextResponse.redirect(fallback);
  }

  const redirectUri = oauthCallbackUrl(platform, request);

  try {
    const provider = getProvider(
      platform,
      mergeProviderCredentials(
        platform,
        oauthCookie.credentials ? { credentials: oauthCookie.credentials } : null
      )
    );
    const tokens = await provider.exchangeCode(
      code,
      redirectUri,
      oauthCookie.codeVerifier ?? undefined
    );
    const profile = await provider.getProfile(tokens.accessToken).catch(() => null);
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
        authMethod: state.methodId ?? `${platform}_native`,
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
    console.log(`[oauth-callback] ✅ ${result.created ? "Saved" : "Updated"} ${platform} connection for workspace ${tenant.currentWorkspace.id}`);

    // Cancel "connect account" drip if user just connected their first platform
    try {
      const { cancelDripIfDone } = await import("@/lib/marketing/drip");
      cancelDripIfDone(tenant.user.id, "welcome_2_connect");
    } catch { /* non-critical */ }

    return NextResponse.redirect(fallback);
  } catch (callbackError) {
    console.error(`[oauth-callback] ❌ ${platform} callback failed:`, callbackError);
    fallback.searchParams.set(
      "error",
      callbackError instanceof Error
        ? callbackError.message
        : "Native OAuth callback failed."
    );
    return NextResponse.redirect(fallback);
  }
}

function isPlatformType(value: string): value is PlatformType {
  return (PLATFORM_TYPES as readonly string[]).includes(value);
}
