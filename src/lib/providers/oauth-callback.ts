import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { getRequestAppUrl } from "@/lib/app-url";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import { upsertPlatformConnection } from "@/lib/platform-connections";
import { mergeProviderCredentials } from "@/lib/providers/credentials";
import { FacebookProvider } from "@/lib/providers/facebook";
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

  const redirectUri = oauthCookie.redirectUri ?? oauthCallbackUrl(platform, request);

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

    const profile = await getCallbackProfile(provider, platform, tokens.accessToken);
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
    fallback.searchParams.set(
      "error",
      "Facebook connected, but no manageable Pages were returned. Make sure the signed-in Facebook user has Page access and grants the requested Page permissions."
    );
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
