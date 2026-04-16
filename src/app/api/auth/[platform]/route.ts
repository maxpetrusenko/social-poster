import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { mergeProviderCredentials } from "@/lib/providers/credentials";
import { getProvider } from "@/lib/providers/registry";
import {
  encodeNativeOAuthState,
  NATIVE_OAUTH_COOKIE,
  oauthCallbackPath,
  normalizeRoutePlatform,
} from "@/lib/providers/oauth-state";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const { platform: routePlatform } = await params;
  const platform = normalizeRoutePlatform(routePlatform);
  const appUrl = getRequestAppUrl(request);
  const nonce = crypto.randomBytes(24).toString("base64url");
  const state = encodeNativeOAuthState({
    nonce,
    platform,
    profileId: request.nextUrl.searchParams.get("profileId"),
    methodId: request.nextUrl.searchParams.get("methodId"),
    next: request.nextUrl.searchParams.get("next") ?? "/dashboard/platforms",
  });
  const redirectUri = new URL(
    oauthCallbackPath(platform),
    appUrl
  ).toString();

  try {
    const provider = getProvider(platform, mergeProviderCredentials(platform, null));
    const authUrl = provider.getAuthUrl(redirectUri, state);
    const cookieStore = await cookies();
    cookieStore.set(NATIVE_OAUTH_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const fallback = new URL("/dashboard/platforms", appUrl);
    fallback.searchParams.set(
      "error",
      error instanceof Error ? error.message : "Native OAuth unavailable"
    );
    return NextResponse.redirect(fallback);
  }
}
