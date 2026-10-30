export const SITE_DOMAINS = {
  app: "smmagent.app",
  legacyApp: "social.maxpetrusenko.com",
  // Retired 2026-10-30. Still served until DNS/redirect moves; never canonical.
  retiredProduct: "clawposter.app",
  retiredSmm: "smmclaw.app",
  smmAgent: "smmagent.app",
} as const;

export type SiteDomain = (typeof SITE_DOMAINS)[keyof typeof SITE_DOMAINS];

export const APP_DOMAIN_TRANSITION_MODE = "dual-host" as const;

export const WWW_REDIRECTS = {
  "www.social.maxpetrusenko.com": SITE_DOMAINS.app,
  "www.clawposter.app": SITE_DOMAINS.retiredProduct,
  "www.smmclaw.app": SITE_DOMAINS.retiredSmm,
  "www.smmagent.app": SITE_DOMAINS.app,
} as const satisfies Record<string, SiteDomain>;

/** Hosts that serve the marketing site. Only smmagent.app is canonical. */
export const CANONICAL_PUBLIC_HOSTS = [SITE_DOMAINS.smmAgent] as const;

/** Retired brand hosts (apex and www). 301 to smmagent.app when RETIRED_DOMAIN_REDIRECT=1. */
export const RETIRED_HOSTS: readonly string[] = [
  "clawposter.app",
  "www.clawposter.app",
  "smmclaw.app",
  "www.smmclaw.app",
];

export const APP_ORIGIN = `https://${SITE_DOMAINS.app}`;
export const SMM_AGENT_ORIGIN = `https://${SITE_DOMAINS.smmAgent}`;
export const DEFAULT_CANONICAL_ORIGIN = SMM_AGENT_ORIGIN;

function stripPort(host: string) {
  return host.toLowerCase().replace(/:\d+$/, "");
}

export function normalizeHost(host?: string | null) {
  if (!host) {
    return null;
  }

  return stripPort(host);
}

export type AppHostKind = "canonical" | "legacy";

export function getAppHostKind(host?: string | null): AppHostKind | null {
  const normalizedHost = normalizeHost(host);

  if (normalizedHost === SITE_DOMAINS.app) {
    return "canonical";
  }

  if (
    APP_DOMAIN_TRANSITION_MODE === "dual-host" &&
    normalizedHost === SITE_DOMAINS.legacyApp
  ) {
    return "legacy";
  }

  return null;
}

export function isAppHost(host?: string | null) {
  return getAppHostKind(host) !== null;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- host args stay so call sites keep one signature */
/**
 * Every public marketing URL (canonical, og:url, JSON-LD, sitemap, robots)
 * lives on smmagent.app, whatever host the request arrived on.
 */
export function getCanonicalHost(_host?: string | null): string {
  return SITE_DOMAINS.smmAgent;
}

export function getCanonicalOrigin(_host?: string | null) {
  return SMM_AGENT_ORIGIN;
}

export function getCanonicalUrl(pathname = "/", host?: string | null) {
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;

  return new URL(normalizedPathname, getCanonicalOrigin(host)).toString();
}

export function getAppCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname);
}

export function getSmmAgentCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname);
}

export function isRetiredHost(host?: string | null) {
  const normalizedHost = normalizeHost(host);
  return normalizedHost !== null && RETIRED_HOSTS.includes(normalizedHost);
}

/** Hosts that render the public marketing pages (smmagent.app plus retired hosts still served). */
export function isPublicMarketingHost(host?: string | null) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) return false;
  return (
    normalizedHost === SITE_DOMAINS.smmAgent ||
    normalizedHost === "www.smmagent.app" ||
    isRetiredHost(normalizedHost)
  );
}

export type PublicSiteKey = "smmagent";

export function getPublicSiteHost(_siteKey?: PublicSiteKey): string {
  return SITE_DOMAINS.smmAgent;
}

export function getPublicSiteKey(_host?: string | null): PublicSiteKey {
  return "smmagent";
}

export function getPublicSiteBrandName(_host?: string | null) {
  return "SMM Agent";
}

/* eslint-enable @typescript-eslint/no-unused-vars */

export function getRedirectHost(host?: string | null) {
  const normalizedHost = normalizeHost(host);

  if (!normalizedHost) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(WWW_REDIRECTS, normalizedHost)
    ? WWW_REDIRECTS[normalizedHost as keyof typeof WWW_REDIRECTS]
    : null;
}
