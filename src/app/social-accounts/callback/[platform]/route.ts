import { NextRequest } from "next/server";
import { handleNativeOAuthCallback } from "@/lib/providers/oauth-callback";
import { normalizeRoutePlatform } from "@/lib/providers/oauth-state";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform: routePlatform } = await params;
  return handleNativeOAuthCallback(request, normalizeRoutePlatform(routePlatform));
}
