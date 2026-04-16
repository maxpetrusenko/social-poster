import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getRequestAppUrl } from "@/lib/app-url";
import { mergeProviderCredentials } from "@/lib/providers/credentials";
import { getProvider } from "@/lib/providers/registry";
import {
  encodeNativeOAuthState,
  encodeNativeOAuthCookie,
  NATIVE_OAUTH_COOKIE,
  oauthCallbackUrl,
  normalizeRoutePlatform,
} from "@/lib/providers/oauth-state";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  return startNativeOAuth(request, params);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  return startNativeOAuth(request, params, await readBodyCredentials(request));
}

async function startNativeOAuth(
  request: NextRequest,
  params: Promise<{ platform: string }>,
  transientCredentials?: { clientId?: string; clientSecret?: string } | null
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const { platform: routePlatform } = await params;
  const platform = normalizeRoutePlatform(routePlatform);
  const appUrl = getRequestAppUrl(request);

  const nonce = crypto.randomBytes(24).toString("base64url");
  const codeVerifier = crypto.randomBytes(48).toString("base64url");
  const state = encodeNativeOAuthState({
    nonce,
    platform,
    profileId: request.nextUrl.searchParams.get("profileId"),
    methodId: request.nextUrl.searchParams.get("methodId"),
    next: request.nextUrl.searchParams.get("next") ?? "/dashboard/platforms",
  });
  const redirectUri = oauthCallbackUrl(platform, appUrl);

  if (!sameOrigin(appUrl, redirectUri)) {
    return oauthStartError(
      request,
      appUrl,
      `OAuth callback for ${platform} is pinned to ${redirectUri}. Open that domain to connect.`
    );
  }

  try {
    const provider = getProvider(
      platform,
      mergeProviderCredentials(platform, credentialsToConfig(transientCredentials))
    );
    const authUrl = provider.getAuthUrl(redirectUri, state, codeVerifier);
    const cookieStore = await cookies();
    cookieStore.set(NATIVE_OAUTH_COOKIE, encodeNativeOAuthCookie({
      nonce,
      codeVerifier,
      credentials: transientCredentials ?? null,
    }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 10 * 60,
      path: "/",
    });
    if (request.method === "POST") {
      return NextResponse.json({ authUrl });
    }
    return NextResponse.redirect(authUrl);
  } catch (error) {
    return oauthStartError(
      request,
      appUrl,
      error instanceof Error ? error.message : "Native OAuth unavailable"
    );
  }
}

function oauthStartError(request: NextRequest, appUrl: string, message: string) {
  if (request.method === "POST") {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const fallback = new URL("/dashboard/platforms", appUrl);
  fallback.searchParams.set("error", message);
  return NextResponse.redirect(fallback);
}

function sameOrigin(left: string, right: string) {
  try {
    return new URL(left).origin === new URL(right).origin;
  } catch {
    return false;
  }
}

async function readBodyCredentials(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body) return null;
  const clientId =
    typeof body.clientId === "string" && body.clientId.trim()
      ? body.clientId.trim()
      : undefined;
  const clientSecret =
    typeof body.clientSecret === "string" && body.clientSecret.trim()
      ? body.clientSecret.trim()
      : undefined;
  return clientId || clientSecret ? { clientId, clientSecret } : null;
}

function credentialsToConfig(
  credentials?: { clientId?: string; clientSecret?: string } | null
) {
  return credentials ? { credentials } : null;
}
