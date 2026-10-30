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
  APP_ORIGIN,
  SITE_DOMAINS,
  getAppHostKind,
  getRedirectHost,
  isAppHost,
  isPublicMarketingHost,
  isRetiredHost,
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

const SEO_PUBLIC_PATHS = ["/", "/blog", "/social-media-bot", "/docs", "/privacy", "/terms"];

function isSeoPublicPath(pathname: string) {
  return (
    SEO_PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/docs/")
  );
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

// Paths that must keep answering on a retired host: OAuth callbacks and
// webhooks have the host baked into third-party config, and /health is the
// deploy canary.
const RETIRED_REDIRECT_EXCLUDED_PREFIXES = [
  "/api/",
  "/auth/",
  "/social-accounts/callback/",
  "/health",
];

function isRetiredRedirectExcluded(pathname: string) {
  return RETIRED_REDIRECT_EXCLUDED_PREFIXES.some(
    (prefix) =>
      pathname.startsWith(prefix) || pathname === prefix.replace(/\/$/, "")
  );
}

export async function middleware(request: NextRequest) {
  const host = normalizeHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );

  if (
    process.env.RETIRED_DOMAIN_REDIRECT === "1" &&
    isRetiredHost(host) &&
    !isRetiredRedirectExcluded(request.nextUrl.pathname)
  ) {
    return NextResponse.redirect(
      `${APP_ORIGIN}${request.nextUrl.pathname}${request.nextUrl.search}`,
      301
    );
  }
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
    return permanentHostRedirect(request, SITE_DOMAINS.app);
  }

  if (
    host &&
    !isAppHost(host) &&
    isPublicMarketingHost(host) &&
    isAppOnlyPath(request.nextUrl.pathname)
  ) {
    return appHostRedirect(request);
  }

  const stripped = new Headers(request.headers);
  stripped.delete("x-seo-path");
  const passThrough = () => NextResponse.next({ request: { headers: stripped } });

  if (!request.nextUrl.pathname.startsWith("/dashboard")) {
    if (host && isPublicMarketingHost(host) && isSeoPublicPath(request.nextUrl.pathname)) {
      const forwarded = new Headers(stripped);
      forwarded.set("x-seo-path", request.nextUrl.pathname);
      return NextResponse.next({ request: { headers: forwarded } });
    }
    return passThrough();
  }

  if (AUTH_MODE === "bypass") {
    if (
      isBypassSignedOutCookieValue(
        request.cookies.get(BYPASS_SIGNED_OUT_COOKIE)?.value
      )
    ) {
      return dashboardLoginRedirect(request);
    }

    return passThrough();
  }

  if (AUTH_MODE === "supabase" && isSupabaseConfigured()) {
    const { storageKey } = getSupabaseServerEnv();
    if (hasCookieLike(request, storageKey)) {
      return passThrough();
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

  return passThrough();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
