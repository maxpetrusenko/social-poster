import { NextRequest } from "next/server";
import { handleNativeOAuthCallback } from "@/lib/providers/oauth-callback";
import {
  normalizeRoutePlatform,
  verifyOAuthState,
} from "@/lib/providers/oauth-state";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform: routePlatform } = await params;
  const platform = normalizeRoutePlatform(routePlatform);

  const stateParam = request.nextUrl.searchParams.get("state");
  const state = stateParam ? verifyOAuthState(stateParam) : null;

  if (state && state.platform !== platform) {
    console.error(
      `[oauth-callback] platform mismatch: route=${platform} state=${state.platform}`
    );
    return handleNativeOAuthCallback(request, platform, null);
  }

  return handleNativeOAuthCallback(request, platform, state);
}
