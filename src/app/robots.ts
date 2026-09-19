import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import {
  getCanonicalUrl,
  getPublicSiteHost,
  getPublicSiteKey,
  normalizeHost,
} from "@/lib/site-domains";

/**
 * robots.txt is host-aware for the same reason sitemap.ts is: this app serves
 * three public brands from one deployment, and a crawler must be pointed at the
 * sitemap of the host it is crawling.
 *
 * Before 2026-09-18 this route read the *product* canonical unconditionally, so
 * https://smmagent.app/robots.txt and https://smmclaw.app/robots.txt both
 * advertised https://clawposter.app/sitemap.xml. A crawler on smmagent.app was
 * handed another brand's URL list, and smmagent.app's own pages were only
 * discoverable by link following. `getPublicSiteHost` is now the single source of
 * truth for "which host owns this request", shared with sitemap.ts.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = await headers().then((h) =>
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host"))
  );
  const canonicalHost = getPublicSiteHost(getPublicSiteKey(host));

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard/",
          "/invite/",
          "/login",
          "/health",
          "/social-accounts/",
        ],
      },
    ],
    sitemap: getCanonicalUrl("/sitemap.xml", canonicalHost),
  };
}
