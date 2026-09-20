import {
  getPublicSiteBrandName,
  getPublicSiteHost,
  getPublicSiteKey,
  isPublicMarketingHost,
} from "@/lib/site-domains";

/**
 * The sitewide structured-data graph for a request host.
 *
 * Three public brands are served by this one deployment (see
 * `src/lib/site-domains.ts`), so a single hardcoded graph would tell Google that
 * smmclaw.app is "SMM Agent". That is the same class of defect as the robots.txt
 * `Sitemap:` line and the sitemap URL list that both handed one brand another
 * brand's URLs. Every value below is derived from
 * `getPublicSiteHost(getPublicSiteKey(host))` — the helper `sitemap.ts` and
 * `robots.ts` already share — so a host can only ever describe itself.
 *
 * Deliberately NOT emitted, with the reason, so nobody "fixes" it later:
 *
 * - `Review` / `AggregateRating`: the reviews these pages talk about are of our
 *   own product, and Google's review-snippet policy disallows self-serving
 *   review markup. The pages also explicitly decline to publish invented
 *   ratings (`src/components/landing/smm-home.tsx`, "We do not fabricate reviews
 *   or buy ratings"), so markup for ratings that do not exist would be both a
 *   policy violation and a false claim. Missing Review markup on these
 *   properties is a non-action, not a gap.
 * - `SearchAction`: no host serves a search URL. `/search` returns 404 on
 *   clawposter.app, smmclaw.app and smmagent.app (checked 2026-09-20), so a
 *   `potentialAction` would point at a URL that does not exist. Add it only
 *   once a real search endpoint exists.
 * - `offers`: no price is published on the public pages. The only pricing
 *   language in the app is the generic "we may change pricing, limits, trials"
 *   clause in `/terms`, which is not a price. Schema.org allows a
 *   SoftwareApplication without `offers`, so the field is omitted rather than
 *   invented; add it when a real price is on the page.
 *
 * Because `offers` and rating markup are absent by policy, this graph is
 * entity/identity markup rather than a bid for Google's Software App rich
 * result (which requires price plus rating or review). That is intentional.
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
 * Returns `null` for any host that is not one of the three public marketing
 * hosts — the legacy `social.maxpetrusenko.com` host, a custom domain, or
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
