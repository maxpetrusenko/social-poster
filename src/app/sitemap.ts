import type { MetadataRoute } from "next";
import { BLOG_POSTS } from "@/lib/blog/posts";
import { getProductCanonicalUrl } from "@/lib/site-domains";

function categorySlug(category: string) {
  return category.toLowerCase().replace(/\s+/g, "-");
}

export default function sitemap(): MetadataRoute.Sitemap {
  const blogPosts: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: getProductCanonicalUrl(`/blog/${post.slug}`),
    lastModified: new Date(`${post.publishedAt}T00:00:00.000Z`),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const blogCategories: MetadataRoute.Sitemap = Array.from(
    new Set(BLOG_POSTS.map((post) => post.category))
  ).map((category) => ({
    url: getProductCanonicalUrl(`/blog/category/${categorySlug(category)}`),
    changeFrequency: "weekly",
    priority: 0.55,
  }));

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
    ...blogCategories,
    ...blogPosts,
  ];
}
