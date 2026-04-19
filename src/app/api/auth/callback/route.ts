import { NextRequest, NextResponse } from "next/server";
import {
  decodeNativeOAuthState,
  verifyOAuthState,
  routePlatformPath,
} from "@/lib/providers/oauth-state";

/**
 * Legacy callback shim — redirects to the new per-platform callback route.
 * Keeps existing portal URIs (pointing to /api/auth/callback) working.
 */
export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get("state");

  // Try signed state first, fall back to legacy unsigned
  const state = stateParam
    ? verifyOAuthState(stateParam) ?? decodeNativeOAuthState(stateParam)
    : null;
  const platform = state?.platform;

  if (!platform) {
    return NextResponse.redirect(
      new URL("/dashboard/workspace-settings/social-accounts?error=Missing+OAuth+state", request.url)
    );
  }

  const target = new URL(
    `/api/auth/callback/${routePlatformPath(platform)}`,
    request.url
  );
  target.search = request.nextUrl.search;
  return NextResponse.redirect(target);
}
