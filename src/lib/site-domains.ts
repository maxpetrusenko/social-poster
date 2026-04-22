export const SITE_DOMAINS = {
  app: "social.maxpetrusenko.com",
  product: "clawposter.app",
  smm: "smmclaw.app",
  smmAgent: "smmagent.app",
} as const;

export type SiteDomain = (typeof SITE_DOMAINS)[keyof typeof SITE_DOMAINS];

export const WWW_REDIRECTS = {
  "www.social.maxpetrusenko.com": SITE_DOMAINS.app,
  "www.clawposter.app": SITE_DOMAINS.product,
  "www.smmclaw.app": SITE_DOMAINS.smm,
  "www.smmagent.app": SITE_DOMAINS.smmAgent,
} as const satisfies Record<string, SiteDomain>;

export const CANONICAL_PUBLIC_HOSTS = [
  SITE_DOMAINS.product,
  SITE_DOMAINS.smm,
  SITE_DOMAINS.smmAgent,
] as const;

export const APP_ORIGIN = `https://${SITE_DOMAINS.app}`;
export const PRODUCT_ORIGIN = `https://${SITE_DOMAINS.product}`;
export const SMM_ORIGIN = `https://${SITE_DOMAINS.smm}`;
export const SMM_AGENT_ORIGIN = `https://${SITE_DOMAINS.smmAgent}`;
export const DEFAULT_CANONICAL_ORIGIN = PRODUCT_ORIGIN;

function stripPort(host: string) {
  return host.toLowerCase().replace(/:\d+$/, "");
}

export function normalizeHost(host?: string | null) {
  if (!host) {
    return null;
  }

  return stripPort(host);
}

export function getCanonicalHost(host?: string | null): string | null {
  const normalizedHost = normalizeHost(host);

  if (!normalizedHost) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(WWW_REDIRECTS, normalizedHost)
    ? WWW_REDIRECTS[normalizedHost as keyof typeof WWW_REDIRECTS]
    : normalizedHost;
}

export function getCanonicalOrigin(host?: string | null) {
  const canonicalHost = getCanonicalHost(host) ?? SITE_DOMAINS.product;
  return `https://${canonicalHost}`;
}

export function getCanonicalUrl(pathname = "/", host?: string | null) {
  const normalizedPathname = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;

  return new URL(normalizedPathname, getCanonicalOrigin(host)).toString();
}

export function getAppCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname, SITE_DOMAINS.app);
}

export function getProductCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname, SITE_DOMAINS.product);
}

export function getSmmCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname, SITE_DOMAINS.smm);
}

export function getSmmAgentCanonicalUrl(pathname = "/") {
  return getCanonicalUrl(pathname, SITE_DOMAINS.smmAgent);
}

export function isPublicMarketingHost(host?: string | null) {
  const canonicalHost = getCanonicalHost(host);

  return (
    canonicalHost === SITE_DOMAINS.product ||
    canonicalHost === SITE_DOMAINS.smm ||
    canonicalHost === SITE_DOMAINS.smmAgent
  );
}

export type PublicSiteKey = "clawposter" | "smmclaw" | "smmagent";

export function getPublicSiteKey(host?: string | null): PublicSiteKey {
  const canonicalHost = getCanonicalHost(host);
  if (canonicalHost === SITE_DOMAINS.smm) return "smmclaw";
  if (canonicalHost === SITE_DOMAINS.smmAgent) return "smmagent";
  return "clawposter";
}

export function getPublicSiteBrandName(host?: string | null) {
  const siteKey = getPublicSiteKey(host);
  if (siteKey === "smmclaw") return "SMMClaw";
  if (siteKey === "smmagent") return "SMM Agent";
  return "ClawPoster";
}

export function getRedirectHost(host?: string | null) {
  const normalizedHost = normalizeHost(host);

  if (!normalizedHost) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(WWW_REDIRECTS, normalizedHost)
    ? WWW_REDIRECTS[normalizedHost as keyof typeof WWW_REDIRECTS]
    : null;
}
