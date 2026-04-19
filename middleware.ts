import { AUTH_MODE, SESSION_COOKIE } from "@/lib/auth-config";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  if (AUTH_MODE === "bypass") {
    return NextResponse.next();
  }

  if (AUTH_MODE === "supabase" && isSupabaseConfigured()) {
    const { url, anonKey } = getSupabasePublicEnv();
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      return response;
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  const session =
    AUTH_MODE === "magic_link"
      ? request.cookies.get(SESSION_COOKIE)?.value
      : null;

  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*"],
};
