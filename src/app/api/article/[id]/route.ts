import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { blogAutomationPosts } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { validateSourceOfTruthArticle, type BlogDraft } from "@/lib/blog/framework";

type Params = {
  params: Promise<{ id: string }>;
};

const patchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  excerpt: z.string().max(500).optional(),
  contentMarkdown: z.string().min(1).max(80_000).optional(),
  heroImageUrl: z.string().url().nullable().optional(),
  heroImageAlt: z.string().max(240).nullable().optional(),
  directAnswer: z.string().max(1000).optional(),
  thesis: z.string().max(2000).optional(),
  status: z.enum(["draft", "needs_review", "approved", "archived"]).optional(),
});

export async function GET(_request: Request, { params }: Params) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  const post = await getArticle(id);
  if (!post) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  return NextResponse.json({
    id: post.id,
    topic: post.topic,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    status: post.status,
    reviewStatus: post.reviewStatus,
    publishStatus: post.publishStatus,
    directAnswer: post.directAnswer,
    thesis: post.thesis,
    contentMarkdown: post.contentMarkdown,
    heroImageUrl: post.heroImageUrl,
    heroImageAlt: post.heroImageAlt,
    sources: post.sources ?? [],
    validationStatus: post.validationStatus,
    validationScore: post.validationScore,
    frameworkChecks: post.frameworkChecks,
    targetWords: post.targetWords,
    mediumArticleId: post.mediumArticleId,
    mediumUrl: post.mediumUrl,
    externalDraftPath: post.externalDraftPath,
    metadata: post.metadata,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    dashboardUrl: `/dashboard/articles/${post.id}`,
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid article update" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const post = await getArticle(id);
  if (!post) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const next = {
    ...post,
    ...parsed.data,
  };
  const validation = validateSourceOfTruthArticle(toDraft(next));
  const now = new Date();

  await db
    .update(blogAutomationPosts)
    .set({
      ...parsed.data,
      validationStatus: validation.status,
      validationScore: validation.score,
      frameworkChecks: {
        ...(post.frameworkChecks ?? {}),
        checks: validation.checks,
        editedVia: "api/article/[id]",
      },
      updatedAt: now,
    })
    .where(eq(blogAutomationPosts.id, id));

  return NextResponse.json({
    id,
    validation,
    updatedAt: now,
  });
}

async function getArticle(id: string) {
  const [post] = await db
    .select()
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.id, id))
    .limit(1);
  return post ?? null;
}

function toDraft(post: NonNullable<Awaited<ReturnType<typeof getArticle>>>): BlogDraft {
  return {
    topic: post.topic,
    title: post.title,
    excerpt: post.excerpt,
    category: post.category,
    directAnswer: post.directAnswer,
    thesis: post.thesis,
    contentMarkdown: post.contentMarkdown,
    heroImageUrl: post.heroImageUrl,
    heroImageAlt: post.heroImageAlt,
    sources: post.sources ?? [],
    targetWords: post.targetWords,
  };
}
