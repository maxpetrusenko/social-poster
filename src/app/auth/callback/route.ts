import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
  isWorkspaceUserAllowed,
} from "@/lib/supabase/config";

function sanitizeNextPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith("/")) {
    return "/dashboard";
  }

  return candidate.startsWith("/auth") ? "/dashboard" : candidate;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));

  if (!code || !isSupabaseConfigured()) {
    const fallbackUrl = request.nextUrl.clone();
    fallbackUrl.pathname = "/login";
    fallbackUrl.search = "";
    fallbackUrl.searchParams.set(
      "error",
      isSupabaseConfigured() ? "oauth" : "missing-config"
    );
    fallbackUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(fallbackUrl);
  }

  const { url, anonKey } = getSupabasePublicEnv();
  let response = NextResponse.redirect(new URL(nextPath, request.url));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        response = NextResponse.redirect(new URL(nextPath, request.url));
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isWorkspaceUserAllowed(user?.email)) {
      return response;
    }

    await supabase.auth.signOut();

    const unauthorizedUrl = request.nextUrl.clone();
    unauthorizedUrl.pathname = "/login";
    unauthorizedUrl.search = "";
    unauthorizedUrl.searchParams.set("error", "unauthorized");
    unauthorizedUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(unauthorizedUrl);
  }

  const fallbackUrl = request.nextUrl.clone();
  fallbackUrl.pathname = "/login";
  fallbackUrl.search = "";
  fallbackUrl.searchParams.set("error", "oauth");
  fallbackUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(fallbackUrl);
}
