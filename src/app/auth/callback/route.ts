import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import { getRequestAppUrl } from "@/lib/app-url";
import { isEmailAllowedForAuth } from "@/lib/auth-allowlist";

function sanitizeNextPath(candidate: string | null): string {
  if (!candidate || !candidate.startsWith("/")) {
    return "/dashboard";
  }

  return candidate.startsWith("/auth") ? "/dashboard" : candidate;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = sanitizeNextPath(request.nextUrl.searchParams.get("next"));
  const appUrl = getRequestAppUrl(request);

  if (!code || !isSupabaseConfigured()) {
    const fallbackUrl = new URL("/login", appUrl);
    fallbackUrl.searchParams.set(
      "error",
      isSupabaseConfigured() ? "oauth" : "missing-config"
    );
    fallbackUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(fallbackUrl);
  }

  const { url, anonKey } = getSupabasePublicEnv();
  let response = NextResponse.redirect(new URL(nextPath, appUrl));

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        response = NextResponse.redirect(new URL(nextPath, appUrl));
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

    if (await isEmailAllowedForAuth(user?.email)) {
      return response;
    }

    await supabase.auth.signOut();

    const unauthorizedUrl = new URL("/login", appUrl);
    unauthorizedUrl.searchParams.set("error", "unauthorized");
    unauthorizedUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(unauthorizedUrl);
  }

  const fallbackUrl = new URL("/login", appUrl);
  fallbackUrl.searchParams.set("error", "oauth");
  fallbackUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(fallbackUrl);
}
