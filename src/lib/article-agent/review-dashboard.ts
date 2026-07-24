import "server-only";

import { db } from "@/db";
import { blogAutomationPosts } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { isAdmin } from "@/lib/admin-auth";
import { getAllPublicBlogPosts } from "@/lib/blog/dynamic";
import {
  getSmmAgentCanonicalUrl,
  SITE_DOMAINS,
} from "@/lib/site-domains";
import {
  canEditCurrentWorkspaceContent,
  getTenantContext,
} from "@/lib/tenancy";

const RECENT_GENERATED_ARTICLE_LIMIT = 20;

export type GeneratedArticleReviewItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  validationStatus: string;
  validationScore: number;
  reviewHref: string;
  publicUrl: string | null;
};

export type PublicArticlePreviewItem = {
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  publishedAt: string;
  imageUrl: string | null;
  publicUrl: string;
};

export type ArticleReviewDashboardData = {
  generated: GeneratedArticleReviewItem[];
  publicArticles: PublicArticlePreviewItem[];
};

export async function getArticleReviewDashboardData(): Promise<ArticleReviewDashboardData> {
  const tenant = await getTenantContext();
  const viewerEmail = tenant?.user.email ?? null;
  const viewerIsAdmin = Boolean(viewerEmail && isAdmin(viewerEmail));
  const canReviewGenerated = Boolean(
    tenant && (viewerIsAdmin || canEditCurrentWorkspaceContent(tenant))
  );
  const [generatedRows, publicPosts] = await Promise.all([
    canReviewGenerated
      ? db
          .select({
            id: blogAutomationPosts.id,
            title: blogAutomationPosts.title,
            slug: blogAutomationPosts.slug,
            status: blogAutomationPosts.status,
            publishStatus: blogAutomationPosts.publishStatus,
            validationStatus: blogAutomationPosts.validationStatus,
            validationScore: blogAutomationPosts.validationScore,
            publishedAt: blogAutomationPosts.publishedAt,
          })
          .from(blogAutomationPosts)
          .where(
            viewerIsAdmin
              ? undefined
              : eq(blogAutomationPosts.createdByEmail, viewerEmail!)
          )
          .orderBy(desc(blogAutomationPosts.createdAt))
          .limit(RECENT_GENERATED_ARTICLE_LIMIT)
      : Promise.resolve([]),
    getAllPublicBlogPosts(SITE_DOMAINS.smmAgent),
  ]);

  return {
    generated: generatedRows.map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      status: post.status,
      validationStatus: post.validationStatus,
      validationScore: post.validationScore,
      reviewHref: `/dashboard/articles/${encodeURIComponent(post.id)}`,
      publicUrl: isPublishedPost(post)
        ? getSmmAgentCanonicalUrl(`/blog/${encodeURIComponent(post.slug)}`)
        : null,
    })),
    publicArticles: publicPosts.map((post) => ({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      category: post.category,
      publishedAt: post.publishedAt,
      imageUrl: post.imageUrl ?? null,
      publicUrl: getSmmAgentCanonicalUrl(`/blog/${encodeURIComponent(post.slug)}`),
    })),
  };
}

function isPublishedPost(post: {
  status: string;
  publishStatus: string;
  publishedAt: Date | null;
}) {
  return (
    post.status === "published" &&
    post.publishStatus === "published" &&
    post.publishedAt !== null
  );
}
