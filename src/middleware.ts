import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_MODE,
  BYPASS_SIGNED_OUT_COOKIE,
  isBypassSignedOutCookieValue,
  SESSION_COOKIE,
} from "@/lib/auth-config";
import {
  getSupabaseServerEnv,
  isSupabaseConfigured,
} from "@/lib/supabase/config";
import {
  SITE_DOMAINS,
  getRedirectHost,
  isPublicMarketingHost,
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

function hasCookieLike(request: NextRequest, name: string) {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name === name || cookie.name.startsWith(`${name}.`));
}

function dashboardLoginRedirect(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`
  );
  return NextResponse.redirect(loginUrl);
}

function appHostRedirect(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = SITE_DOMAINS.app;
  url.port = "";
  return NextResponse.redirect(url);
}

function isAppOnlyPath(pathname: string) {
  return (
    pathname === "/login" ||
    pathname === "/auth/callback" ||
    pathname.startsWith("/dashboard")
  );
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

  if (
    host &&
    host !== SITE_DOMAINS.app &&
    isPublicMarketingHost(host) &&
    isAppOnlyPath(request.nextUrl.pathname)
  ) {
    return appHostRedirect(request);
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
      return dashboardLoginRedirect(request);
    }

    return NextResponse.next();
  }

  if (AUTH_MODE === "supabase" && isSupabaseConfigured()) {
    const { storageKey } = getSupabaseServerEnv();
    if (hasCookieLike(request, storageKey)) {
      return NextResponse.next();
    }

    return dashboardLoginRedirect(request);
  }

  const session =
    AUTH_MODE === "magic_link"
      ? request.cookies.get(SESSION_COOKIE)?.value
      : null;

  if (!session) {
    return dashboardLoginRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
