import { NextRequest } from "next/server";
import { handleNativeOAuthCallback } from "@/lib/providers/oauth-callback";
import { decodeNativeOAuthState } from "@/lib/providers/oauth-state";

export async function GET(request: NextRequest) {
  const state = decodeNativeOAuthState(request.nextUrl.searchParams.get("state"));
  return handleNativeOAuthCallback(request, state?.platform ?? "");
}
