import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isSiteFlagOn } from "@/lib/seo-flags";
import {
  getCanonicalUrl,
  getPublicSiteHost,
  getPublicSiteKey,
  normalizeHost,
} from "@/lib/site-domains";

const PRIVATE_DISALLOW = [
  "/api/",
  "/auth/",
  "/dashboard/",
  "/invite/",
  "/login",
  "/health",
  "/social-accounts/",
];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "Googlebot",
  "CCBot",
  "meta-externalagent",
  "DuckAssistBot",
];

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

  const rules: MetadataRoute.Robots["rules"] = [
    { userAgent: "*", allow: ["/"], disallow: PRIVATE_DISALLOW },
  ];

  // seo_h005_ai_crawlers: a named group replaces the "*" group for that bot, so
  // the private disallows are repeated on it.
  if (isSiteFlagOn("seo_h005_ai_crawlers")) {
    rules.push({
      userAgent: AI_CRAWLERS,
      allow: ["/"],
      disallow: ["/admin/", ...PRIVATE_DISALLOW],
    });
  }

  return {
    rules,
    sitemap: getCanonicalUrl("/sitemap.xml", canonicalHost),
  };
}
