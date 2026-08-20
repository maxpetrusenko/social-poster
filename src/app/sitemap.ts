import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getPublishedDynamicBlogPosts } from "@/lib/blog/automation";
import {
  getAppCanonicalUrl,
  getProductCanonicalUrl,
  getSmmAgentCanonicalUrl,
  getSmmCanonicalUrl,
  type PublicSiteKey,
} from "@/lib/site-domains";

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

/**
 * Hosts where a post actually renders. Posts declare `audiences` (site keys);
 * posts without audiences are ClawPoster-branded legacy content visible on
 * the product host only. Emitting a URL on a host where the page 404s is a
 * GSC "Sitemap has errors / page with redirect" risk, so each URL must be
 * emitted on exactly the host(s) that serve it.
 */
function canonicalUrlForSiteKey(siteKey: PublicSiteKey, pathname: string): string {
  switch (siteKey) {
    case "clawposter":
      return getProductCanonicalUrl(pathname);
    case "smmclaw":
      return getSmmCanonicalUrl(pathname);
    case "smmagent":
      return getSmmAgentCanonicalUrl(pathname);
  }
}

function hostsForPost(post: {
  audiences?: PublicSiteKey[];
  slug?: string;
  category?: string;
  publishedAt?: string;
}): PublicSiteKey[] {
  return post.audiences?.length ? post.audiences : ["clawposter"];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const dynamicPosts = await getPublishedDynamicBlogPosts();
  const allPosts = [
    ...dynamicPosts.map((post) => ({
      slug: post.slug,
      category: post.category,
      publishedAt: (post.publishedAt ?? post.createdAt).toISOString().slice(0, 10),
    })),
    ...BLOG_POSTS,
  ];

  const blogPosts: MetadataRoute.Sitemap = allPosts.flatMap((post) =>
    hostsForPost(post).map((siteKey) => ({
      url: canonicalUrlForSiteKey(siteKey, `/blog/${post.slug}`),
      lastModified: new Date(`${post.publishedAt}T00:00:00.000Z`),
      changeFrequency: "monthly",
      priority: 0.6,
    }))
  );

  // A category URL is only valid on a host that has at least one post in it.
  const categoryHosts = new Map<string, Set<PublicSiteKey>>();
  for (const post of allPosts) {
    const slug = categorySlug(post.category);
    const hosts = categoryHosts.get(slug) ?? new Set<PublicSiteKey>();
    hostsForPost(post).forEach((siteKey) => hosts.add(siteKey));
    categoryHosts.set(slug, hosts);
  }

  const blogCategories: MetadataRoute.Sitemap = Array.from(categoryHosts.entries()).flatMap(
    ([slug, hosts]) =>
      Array.from(hosts).map((siteKey) => ({
        url: canonicalUrlForSiteKey(siteKey, `/blog/category/${slug}`),
        changeFrequency: "weekly",
        priority: 0.55,
      }))
  );

  return [
    {
      url: getProductCanonicalUrl("/"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: getProductCanonicalUrl("/blog"),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: getProductCanonicalUrl("/social-media-bot"),
      changeFrequency: "weekly",
      priority: 0.85,
    },
    {
      url: getAppCanonicalUrl("/docs"),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    ...blogCategories,
    ...blogPosts,
  ];
}
