import { NextRequest } from "next/server";
import { normalizeRoutePlatform } from "@/lib/providers/oauth-state";
import { handleNativeOAuthCallback } from "@/lib/providers/oauth-callback";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform: routePlatform } = await params;
  const platform = normalizeRoutePlatform(routePlatform);
  return handleNativeOAuthCallback(request, platform);
}
