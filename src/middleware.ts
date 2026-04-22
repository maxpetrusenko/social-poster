import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_MODE,
  BYPASS_SIGNED_OUT_COOKIE,
  isBypassSignedOutCookieValue,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import {
  getSupabasePublicEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  SITE_DOMAINS,
  getRedirectHost,
  normalizeHost,
} from "@/lib/site-domains";

const PUBLIC_PRODUCT_PATHS = [
  "/blog",
  "/social-media-bot",
  "/sitemap.xml",
  "/robots.txt",
];

function isProductPath(pathname: string) {
  return PUBLIC_PRODUCT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function permanentHostRedirect(request: NextRequest, host: string) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  url.port = "";
  return NextResponse.redirect(url, 301);
}

export async function middleware(request: NextRequest) {
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );
  const redirectHost = getRedirectHost(host);

  if (redirectHost) {
    return permanentHostRedirect(request, redirectHost);
  }

  if (
    host === SITE_DOMAINS.app &&
    isProductPath(request.nextUrl.pathname)
  ) {
    return permanentHostRedirect(request, SITE_DOMAINS.product);
  }

  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  if (AUTH_MODE === "bypass") {
    if (
      isBypassSignedOutCookieValue(
        request.cookies.get(BYPASS_SIGNED_OUT_COOKIE)?.value
      )
    ) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set(
        "next",
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(loginUrl);
    }

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
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
