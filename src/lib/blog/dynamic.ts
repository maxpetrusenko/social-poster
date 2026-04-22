import "server-only";

import { BLOG_POSTS, type BlogPost } from "./posts";
import {
  findPublishedDynamicBlogPost,
  getPublishedDynamicBlogPosts,
} from "./automation";

export type PublicBlogPost = BlogPost & {
  imageUrl?: string | null;
  imageAlt?: string | null;
  sources?: Array<{ title: string; url: string; publisher?: string }>;
  isMarkdown?: boolean;
};

export async function getAllPublicBlogPosts(): Promise<PublicBlogPost[]> {
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

  return [...mappedDynamic, ...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );
}

export async function findPublicBlogPost(slug: string): Promise<PublicBlogPost | null> {
  const staticPost = BLOG_POSTS.find((post) => post.slug === slug);
  if (staticPost) return staticPost;

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

function formatDate(value: Date | null) {
  return (value ?? new Date()).toISOString().slice(0, 10);
}
