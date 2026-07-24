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
  getAppHostKind,
  getRedirectHost,
  isAppHost,
  isPublicMarketingHost,
  normalizeHost,
} from "@/lib/site-domains";

const PUBLIC_PRODUCT_PATHS = [
  "/social-media-bot",
  "/sitemap.xml",
  "/robots.txt",
];
const PUBLIC_APP_PATHS = ["/blog"];

function matchesPathPrefix(pathname: string, paths: readonly string[]) {
  return paths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

function isProductPath(pathname: string) {
  return matchesPathPrefix(pathname, PUBLIC_PRODUCT_PATHS);
}

function isAppPublicPath(pathname: string) {
  return matchesPathPrefix(pathname, PUBLIC_APP_PATHS);
}

function permanentHostRedirect(request: NextRequest, host: string) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  url.port = "";
  return NextResponse.redirect(url, 301);
}

function permanentMethodPreservingHostRedirect(
  request: NextRequest,
  host: string
) {
  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = host;
  url.port = "";
  return NextResponse.redirect(url, 308);
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

function isLegacyOAuthCallbackPath(pathname: string) {
  return (
    pathname === "/auth/callback" ||
    pathname.startsWith("/social-accounts/callback/") ||
    (pathname.startsWith("/api/auth/") && pathname.includes("/callback"))
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
    getAppHostKind(host) === "legacy" &&
    !isLegacyOAuthCallbackPath(request.nextUrl.pathname)
  ) {
    return permanentMethodPreservingHostRedirect(request, SITE_DOMAINS.app);
  }

  if (
    getAppHostKind(host) === "legacy" &&
    isAppPublicPath(request.nextUrl.pathname)
  ) {
    return permanentHostRedirect(request, SITE_DOMAINS.app);
  }

  if (
    getAppHostKind(host) === "legacy" &&
    isProductPath(request.nextUrl.pathname)
  ) {
    return permanentHostRedirect(request, SITE_DOMAINS.product);
  }

  if (
    host &&
    !isAppHost(host) &&
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
