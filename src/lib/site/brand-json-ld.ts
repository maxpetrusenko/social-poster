import {
  getPublicSiteBrandName,
  getPublicSiteHost,
  getPublicSiteKey,
  isPublicMarketingHost,
} from "@/lib/site-domains";

/**
 * The sitewide structured-data graph. Every URL is on https://smmagent.app and
 * the brand is "SMM Agent", whichever host served the request (clawposter.app
 * and smmclaw.app are retired).
 *
 * Deliberately NOT emitted, with the reason, so nobody "fixes" it later:
 *
 * - `Review` / `AggregateRating`: Google's review-snippet policy disallows
 *   self-serving review markup, and the pages decline to publish invented
 *   ratings (`src/components/landing/smm-home.tsx`).
 * - `SearchAction`: no host serves a search URL, so a `potentialAction` would
 *   point at a 404. Add it once a real search endpoint exists.
 * - `offers`: no price is published on the public pages. Add it when one is.
 *
 * Because `offers` and rating markup are absent by policy, this graph is
 * identity markup, not a bid for Google's Software App rich result.
 */

export type JsonLdNode = Record<string, unknown>;

export type SiteJsonLdGraph = {
  "@context": "https://schema.org";
  "@graph": JsonLdNode[];
};

/** The site's own declared logo asset (`src/app/layout.tsx` icons, public/site.webmanifest). */
const LOGO_PATH = "/logo-256.png";
const LOGO_SIZE = 256;

/**
 * Google's supported `applicationCategory` value closest to what the site says
 * it is: a social media management and publishing surface for agencies and lean
 * teams (`src/components/landing/smm-home.tsx`).
 */
const APPLICATION_CATEGORY = "SocialNetworkingApplication";

/**
 * Google requires `operatingSystem` on SoftwareApplication. This app ships as a
 * browser dashboard, not an installable binary, so the honest value is "Web"
 * rather than a list of desktop operating systems the product has never run on.
 */
const OPERATING_SYSTEM = "Web";

/**
 * Build the graph for the host that served the request.
 *
 * Returns `null` for any host that does not serve the public marketing pages
 * (smmagent.app and the retired hosts that still resolve) — the legacy `social.maxpetrusenko.com` host, a custom domain, or
 * localhost gets no structured data at all, because guessing an identity for
 * them is exactly the failure mode this file exists to prevent.
 */
export function buildSiteJsonLd(host?: string | null): SiteJsonLdGraph | null {
  if (!isPublicMarketingHost(host)) {
    return null;
  }

  const siteKey = getPublicSiteKey(host);
  const canonicalHost = getPublicSiteHost(siteKey);
  const origin = `https://${canonicalHost}`;
  const brandName = getPublicSiteBrandName(canonicalHost);

  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;
  const softwareId = `${origin}/#software`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: brandName,
        url: `${origin}/`,
        logo: {
          "@type": "ImageObject",
          url: `${origin}${LOGO_PATH}`,
          width: LOGO_SIZE,
          height: LOGO_SIZE,
        },
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: `${origin}/`,
        name: brandName,
        // Reciprocal reference: the site is published by this host's own
        // organization node, never another brand's.
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        name: brandName,
        url: `${origin}/`,
        applicationCategory: APPLICATION_CATEGORY,
        operatingSystem: OPERATING_SYSTEM,
        publisher: { "@id": organizationId },
      },
    ],
  };
}

/** Serialize the graph for a `<script type="application/ld+json">` data block. */
export function serializeSiteJsonLd(graph: SiteJsonLdGraph): string {
  return JSON.stringify(graph);
}
