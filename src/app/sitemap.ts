import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getPublishedDynamicBlogPosts } from "@/lib/blog/automation";
import {
  getAppCanonicalUrl,
  getCanonicalUrl,
  getProductCanonicalUrl,
  SITE_DOMAINS,
  normalizeHost,
  getPublicSiteKey,
  type PublicSiteKey,
} from "@/lib/site-domains";

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

/** Host name for a site key (used to emit URLs on the requesting host). */
function hostForSiteKey(siteKey: PublicSiteKey): string {
  switch (siteKey) {
    case "clawposter":
      return SITE_DOMAINS.product;
    case "smmclaw":
      return SITE_DOMAINS.smm;
    case "smmagent":
      return SITE_DOMAINS.smmAgent;
  }
}

/**
 * The sitemap is host-aware: it only lists URLs that actually render on the
 * requesting host, and emits each on that host's canonical origin. Emitting a
 * URL on a host where the page 404s (or listing a different host's URLs) is a
 * GSC "Sitemap has errors / Alternate page" risk.
 *
 * Visibility rules mirror `filterStaticPostsForHost`:
 * - posts WITHOUT `audiences` are visible on every public host;
 * - posts WITH `audiences` are visible only on the listed hosts;
 * - dynamic (DB) posts are visible on every public host.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = await headers().then((h) =>
    normalizeHost(h.get("x-forwarded-host") ?? h.get("host"))
  );
  const siteKey: PublicSiteKey = getPublicSiteKey(host);
  const canonicalHost = hostForSiteKey(siteKey);

  const urlFor = (pathname: string) => getCanonicalUrl(pathname, canonicalHost);

  const dynamicPosts = await getPublishedDynamicBlogPosts();
  const allPosts = [
    ...dynamicPosts.map((post) => ({
      slug: post.slug,
      category: post.category,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString().slice(0, 10),
    })),
    ...BLOG_POSTS,
  ];

  const visible = (post: {
    audiences?: PublicSiteKey[];
    slug?: string;
    category?: string;
    publishedAt?: string;
  }) => !post.audiences?.length || post.audiences.includes(siteKey);

  const blogPosts: MetadataRoute.Sitemap = allPosts
    .filter(visible)
    .map((post) => ({
      url: urlFor(`/blog/${post.slug}`),
      lastModified: new Date(`${post.publishedAt}T00:00:00.000Z`),
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  // A category URL is only valid if at least one visible post is in it.
  const visibleCategories = new Set(
    allPosts.filter(visible).map((post) => categorySlug(post.category))
  );

  const blogCategories: MetadataRoute.Sitemap = Array.from(visibleCategories).map(
    (slug) => ({
      url: urlFor(`/blog/category/${slug}`),
      changeFrequency: "weekly",
      priority: 0.55,
    })
  );

  return [
    {
      url: urlFor("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: urlFor("/blog"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    // /social-media-bot page canonicals to clawposter.app on every host
    // (product brand page) — emit it on that host only, or Google sees an
    // "Alternate page with proper canonical tag" mismatch.
    {
      url: getProductCanonicalUrl("/social-media-bot"),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    // /docs canonicals to smmagent.app on every host (app docs).
    {
      url: getAppCanonicalUrl("/docs"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...blogCategories,
    ...blogPosts,
  ];
}
