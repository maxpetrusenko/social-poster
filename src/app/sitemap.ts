import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getPublishedDynamicBlogPosts } from "@/lib/blog/automation";
import {
  getAppCanonicalUrl,
  getCanonicalUrl,
  getProductCanonicalUrl,
  getPublicSiteHost,
  normalizeHost,
  getPublicSiteKey,
  type PublicSiteKey,
} from "@/lib/site-domains";

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
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
  const canonicalHost = getPublicSiteHost(siteKey);

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

  // Pages that canonicalize to one fixed brand no matter which host serves them: the product
  // page (/social-media-bot) and the app docs (/docs). A sitemap may only list URLs on its own
  // host, so each of these is emitted by the brand that owns it and by no one else. Listing them
  // everywhere is what made smmagent.app/sitemap.xml and smmclaw.app/sitemap.xml advertise
  // https://clawposter.app/social-media-bot - a crawler of one brand handed another brand's URL,
  // the same class of defect as the robots.txt Sitemap: line fixed in the previous commit, and
  // Search Console's "Sitemap contains URLs which are not within the property".
  const brandFixed: MetadataRoute.Sitemap = [
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
  ];

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
    ...brandFixed.filter((entry) => new URL(entry.url).host === canonicalHost),
    ...blogCategories,
    ...blogPosts,
  ];
}
