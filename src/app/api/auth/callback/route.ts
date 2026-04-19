import { NextRequest } from "next/server";
import { handleNativeOAuthCallback } from "@/lib/providers/oauth-callback";
import {
  decodeNativeOAuthState,
  verifyOAuthState,
} from "@/lib/providers/oauth-state";

/**
 * Shared OAuth callback — extracts platform from signed state.
 * Single URI registered in every platform portal: /api/auth/callback
 */
export async function GET(request: NextRequest) {
  const stateParam = request.nextUrl.searchParams.get("state");

  // Try signed state first, fall back to legacy unsigned
  const state = stateParam
    ? verifyOAuthState(stateParam) ?? decodeNativeOAuthState(stateParam)
    : null;

  const platform = state?.platform ?? "";

  return handleNativeOAuthCallback(request, platform, state);
}
