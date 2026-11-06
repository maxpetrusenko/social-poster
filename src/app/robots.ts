import type { MetadataRoute } from "next";
import { isSiteFlagOn } from "@/lib/seo-flags";
import { getCanonicalUrl } from "@/lib/site-domains";

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

/** The Sitemap line always points at https://smmagent.app, whatever host serves robots.txt. */
export default async function robots(): Promise<MetadataRoute.Robots> {
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
    sitemap: getCanonicalUrl("/sitemap.xml"),
  };
}
