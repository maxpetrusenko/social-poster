import "server-only";

import { BLOG_POSTS, type BlogPost } from "./posts";
import {
  findPublishedDynamicBlogPost,
  getPublishedDynamicBlogPosts,
} from "./automation";
import { getPublicSiteKey } from "@/lib/site-domains";

export type PublicBlogPost = BlogPost & {
  imageUrl?: string | null;
  imageAlt?: string | null;
};

export async function getAllPublicBlogPosts(host?: string | null): Promise<PublicBlogPost[]> {
  const dynamicPosts = await getPublishedDynamicBlogPosts();
  const mappedDynamic: PublicBlogPost[] = dynamicPosts.map((post) => ({
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.contentMarkdown,
    category: post.category,
    publishedAt: formatDate(post.publishedAt ?? post.createdAt),
    imageUrl: post.heroImageUrl,
    imageAlt: post.heroImageAlt,
    sources: post.sources ?? [],
    isMarkdown: true,
  }));

  return [...mappedDynamic, ...filterStaticPostsForHost(BLOG_POSTS, host)].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

export async function findPublicBlogPost(slug: string, host?: string | null): Promise<PublicBlogPost | null> {
  const staticPost = BLOG_POSTS.find((post) => post.slug === slug);
  if (staticPost) {
    return filterStaticPostsForHost([staticPost], host)[0] ?? null;
  }

  const post = await findPublishedDynamicBlogPost(slug);
  if (!post) return null;

  return {
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.contentMarkdown,
    category: post.category,
    publishedAt: formatDate(post.publishedAt ?? post.createdAt),
    imageUrl: post.heroImageUrl,
    imageAlt: post.heroImageAlt,
    sources: post.sources ?? [],
    isMarkdown: true,
  };
}

function filterStaticPostsForHost(posts: BlogPost[], host?: string | null) {
  const siteKey = getPublicSiteKey(host);
  return posts.filter((post) => !post.audiences?.length || post.audiences.includes(siteKey));
}

function formatDate(value: Date | null) {
  return (value ?? new Date()).toISOString().slice(0, 10);
}
