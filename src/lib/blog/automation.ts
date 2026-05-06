import "server-only";

import { db } from "@/db";
import { blogAutomationPosts, blogAutomationRuns } from "@/db/schema";
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { saveGeneratedArticleToWorkspace } from "@/lib/article-agent/generated-workspace";
import {
  slugifyBlogTitle,
  validateSourceOfTruthArticle,
  type BlogDraft,
} from "./framework";
import { generateBlogDraftWithMediumAutomation } from "./medium-automation";

export type BlogAutomationTrigger = "manual" | "daily";

type GenerateInput = {
  topic: string;
  targetWords?: number;
  sourceUrls?: string[];
  createdByEmail?: string;
  trigger?: BlogAutomationTrigger;
};

export async function generateBlogAutomationPost(input: GenerateInput) {
  const startedAt = new Date();
  const runId = crypto.randomUUID();
  const targetWords = input.targetWords ?? 2000;
  const trigger = input.trigger ?? "manual";

  await db.insert(blogAutomationRuns).values({
    id: runId,
    trigger,
    phase: "generate",
    status: "running",
    input: {
      topic: input.topic,
      targetWords,
      sourceUrls: input.sourceUrls ?? [],
    },
    startedAt,
  });

  try {
    const { draft, provider, raw } = await generateBlogDraftWithMediumAutomation({
      topic: input.topic,
      targetWords,
      sourceUrls: input.sourceUrls,
    });
    const validation = validateSourceOfTruthArticle(draft);
    const now = new Date();
    const postId = crypto.randomUUID();
    const baseSlug = slugifyBlogTitle(draft.title || input.topic);
    const slug = await uniqueBlogSlug(baseSlug);
    const workspaceArticle = await saveGeneratedArticleToWorkspace({
      draft,
      preferredSlug: slug,
      provider,
      validation,
      postId,
      sourceUrls: input.sourceUrls,
      createdByEmail: input.createdByEmail,
      generatedAt: now,
      raw,
    });

    await db.insert(blogAutomationPosts).values({
      id: postId,
      topic: input.topic,
      slug,
      title: draft.title,
      excerpt: draft.excerpt,
      category: draft.category,
      status: validation.status === "fail" ? "needs_review" : "draft",
      reviewStatus: "needs_review",
      publishStatus: "idle",
      directAnswer: draft.directAnswer,
      thesis: draft.thesis,
      contentMarkdown: draft.contentMarkdown,
      heroImageUrl: draft.heroImageUrl,
      heroImageAlt: draft.heroImageAlt,
      sources: draft.sources,
      frameworkChecks: { provider, checks: validation.checks, raw },
      validationStatus: validation.status,
      validationScore: validation.score,
      targetWords,
      generatedAt: now,
      mediumArticleId: draft.mediumArticleId ?? null,
      mediumUrl: draft.mediumUrl ?? null,
      externalDraftPath: draft.externalDraftPath ?? null,
      createdByEmail: input.createdByEmail,
      metadata: {
        ...(draft.metadata ?? {}),
        articleWorkspace: workspaceArticle,
      },
      createdAt: now,
      updatedAt: now,
    });

    await db
      .update(blogAutomationRuns)
      .set({
        postId,
        status: "completed",
        output: {
          provider,
          validationStatus: validation.status,
          validationScore: validation.score,
          slug,
          articleWorkspace: workspaceArticle,
        },
        completedAt: now,
        durationMs: now.getTime() - startedAt.getTime(),
      })
      .where(eq(blogAutomationRuns.id, runId));

    return { postId, slug, validation, provider, articleWorkspace: workspaceArticle };
  } catch (error) {
    const now = new Date();
    const message = error instanceof Error ? error.message : "Unknown blog generation error";
    await db
      .update(blogAutomationRuns)
      .set({
        status: "failed",
        error: message,
        completedAt: now,
        durationMs: now.getTime() - startedAt.getTime(),
      })
      .where(eq(blogAutomationRuns.id, runId));
    throw error;
  }
}

export async function publishBlogAutomationPost(postId: string) {
  const [post] = await db
    .select()
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.id, postId))
    .limit(1);

  if (!post) throw new Error("Blog post not found.");

  const draft: BlogDraft = {
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
  const validation = validateSourceOfTruthArticle(draft);

  if (validation.status === "fail") {
    throw new Error("Article fails the source-of-truth validation gate.");
  }

  const now = new Date();
  const runId = crypto.randomUUID();
  await db.insert(blogAutomationRuns).values({
    id: runId,
    postId,
    trigger: "publish",
    phase: "publish",
    status: "completed",
    input: { slug: post.slug },
    output: { validationStatus: validation.status, validationScore: validation.score },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
  });

  await db
    .update(blogAutomationPosts)
    .set({
      status: "published",
      reviewStatus: "approved",
      publishStatus: "published",
      validationStatus: validation.status,
      validationScore: validation.score,
      frameworkChecks: { checks: validation.checks },
      reviewedAt: post.reviewedAt ?? now,
      publishedAt: now,
      updatedAt: now,
    })
    .where(eq(blogAutomationPosts.id, postId));

  return { slug: post.slug, validation };
}

export async function archiveBlogAutomationPost(postId: string) {
  await db
    .update(blogAutomationPosts)
    .set({
      status: "archived",
      publishStatus: "archived",
      updatedAt: new Date(),
    })
    .where(eq(blogAutomationPosts.id, postId));
}

export async function getPublishedDynamicBlogPosts() {
  return db
    .select()
    .from(blogAutomationPosts)
    .where(and(eq(blogAutomationPosts.publishStatus, "published"), isNotNull(blogAutomationPosts.publishedAt)))
    .orderBy(desc(blogAutomationPosts.publishedAt));
}

export async function findPublishedDynamicBlogPost(slug: string) {
  const [post] = await db
    .select()
    .from(blogAutomationPosts)
    .where(and(eq(blogAutomationPosts.slug, slug), eq(blogAutomationPosts.publishStatus, "published")))
    .limit(1);
  return post ?? null;
}

export async function hasGeneratedToday(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  const rows = await db
    .select({ id: blogAutomationPosts.id })
    .from(blogAutomationPosts)
    .where(gte(blogAutomationPosts.createdAt, start))
    .limit(1);

  return rows.length > 0;
}

async function uniqueBlogSlug(baseSlug: string) {
  let slug = baseSlug;
  let suffix = 2;

  while (await slugExists(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  return slug;
}

async function slugExists(slug: string) {
  const [row] = await db
    .select({ id: blogAutomationPosts.id })
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.slug, slug))
    .limit(1);
  return Boolean(row);
}
