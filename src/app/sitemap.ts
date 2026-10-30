import type { MetadataRoute } from "next";
import { isSiteFlagOn } from "@/lib/seo-flags";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getPublishedDynamicBlogPosts } from "@/lib/blog/automation";
import {
  getCanonicalUrl,
} from "@/lib/site-domains";
import {
  newestDate,
  routeLastmod,
  toLastModified,
} from "@/lib/site/sitemap-lastmod";

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Every URL is emitted on https://smmagent.app, whatever host serves the
 * request. Retired hosts (clawposter.app, smmclaw.app) return the same list.
 */
// Reads the blog table, so it must not be prerendered at build time.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urlFor = (pathname: string) => getCanonicalUrl(pathname);

  const dynamicPosts = await getPublishedDynamicBlogPosts();
  const allPosts = [
    ...dynamicPosts.map((post) => ({
      slug: post.slug,
      category: post.category,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString().slice(0, 10),
    })),
    ...BLOG_POSTS,
  ];

  const blogPosts: MetadataRoute.Sitemap = allPosts
    .map((post) => ({
      url: urlFor(`/blog/${post.slug}`),
      lastModified: toLastModified(post.publishedAt),
      changeFrequency: "monthly",
      priority: 0.6,
    }));

  // A category URL is only valid if at least one post is in it, and the
  // category's freshness is the newest post inside it — a per-URL value derived
  // from that URL's own content, never a site-wide build date.
  const categoryLastmod = new Map<string, string>();
  for (const post of allPosts) {
    const slug = categorySlug(post.category);
    categoryLastmod.set(slug, newestDate([categoryLastmod.get(slug), post.publishedAt]));
  }

  const blogCategories: MetadataRoute.Sitemap = Array.from(categoryLastmod).map(
    ([slug, lastmod]) => ({
      url: urlFor(`/blog/category/${slug}`),
      lastModified: toLastModified(lastmod),
      changeFrequency: "weekly",
      priority: 0.55,
    })
  );

  const fixed: MetadataRoute.Sitemap = [
    {
      url: urlFor("/social-media-bot"),
      lastModified: toLastModified(routeLastmod("/social-media-bot")),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: urlFor("/docs"),
      lastModified: toLastModified(routeLastmod("/docs")),
      changeFrequency: "weekly",
      priority: 0.7,
    },
  ];

  // seo_h021_indexing: /privacy and /terms are public and indexable.
  const legal: MetadataRoute.Sitemap = isSiteFlagOn("seo_h021_indexing")
    ? ["/privacy", "/terms"].map((route) => ({
        url: urlFor(route),
        lastModified: toLastModified(routeLastmod(route)),
        changeFrequency: "yearly" as const,
        priority: 0.3,
      }))
    : [];

  return [
    {
      url: urlFor("/"),
      lastModified: toLastModified(routeLastmod("/")),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: urlFor("/blog"),
      lastModified: toLastModified(routeLastmod("/blog")),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...fixed,
    ...legal,
    ...blogCategories,
    ...blogPosts,
  ];
}
