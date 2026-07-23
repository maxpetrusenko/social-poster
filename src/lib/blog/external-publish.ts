import "server-only";

import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { blogAutomationPosts, blogAutomationRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { slugifyBlogTitle } from "./framework";
import {
  INLINE_LINK_PATTERN,
  validateExternalBlogPublishPayload,
  type ExternalBlogPublishPayload,
} from "./external-publish-contract";

export { isBlogPublishAuthorized } from "./external-publish-contract";

export async function publishExternalBlogArticle(value: unknown) {
  const validated = validateExternalBlogPublishPayload(value);
  const payload = value as ExternalBlogPublishPayload;
  const externalDraftPath = `hermes:${payload.runId}`;

  const [existing] = await db
    .select()
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.externalDraftPath, externalDraftPath))
    .limit(1);
  if (existing?.publishStatus === "published") {
    return publishResult(existing.slug, true, validated.warnings);
  }

  const now = new Date();
  const postId = randomUUID();
  const slug = await uniqueBlogSlug(slugifyBlogTitle(validated.title));
  const bodyText = payload.article
    .replace(/^#\s+.+$/m, "")
    .replace(INLINE_LINK_PATTERN, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const excerpt = bodyText.slice(0, 220).trim();
  const sources = validated.inlineUrls.map((url) => ({
    title: new URL(url).hostname,
    url,
    publisher: new URL(url).hostname,
  }));

  await db.insert(blogAutomationPosts).values({
    id: postId,
    topic: validated.title,
    slug,
    title: validated.title,
    excerpt,
    category: "Automation",
    status: "published",
    reviewStatus: "approved",
    publishStatus: "published",
    directAnswer: excerpt,
    thesis: excerpt,
    contentMarkdown: payload.article,
    sources,
    frameworkChecks: {
      externalHermesReview: true,
      exactHashReview: true,
      minimumInlineSources: true,
      minimumWordCount: true,
      licensedCommonsImage: payload.contractVersion === 2,
    },
    validationStatus: "pass",
    validationScore: 100,
    targetWords: validated.visibleWordCount,
    generatedAt: now,
    reviewedAt: now,
    publishedAt: now,
    externalDraftPath,
    metadata: {
      generator: "hermes-source-of-truth",
      externalRunId: payload.runId,
      externalPackageId: payload.packageId,
      articleSha256: validated.articleSha256,
      warnings: validated.warnings,
      approvalMode: "autonomous-explicit-user-policy",
    },
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(blogAutomationRuns).values({
    id: randomUUID(),
    postId,
    trigger: "external_hermes",
    phase: "publish",
    status: "completed",
    input: { runId: payload.runId, packageId: payload.packageId },
    output: {
      slug,
      articleSha256: validated.articleSha256,
      approvalMode: "autonomous-explicit-user-policy",
    },
    startedAt: now,
    completedAt: now,
    durationMs: 0,
  });

  return publishResult(slug, false, validated.warnings);
}

function publishResult(slug: string, alreadyPublished: boolean, warnings: string[]) {
  return {
    slug,
    publicUrl: `https://smmagent.app/blog/${slug}`,
    alreadyPublished,
    warnings,
  };
}

async function uniqueBlogSlug(baseSlug: string) {
  let slug = baseSlug;
  let suffix = 2;
  while (true) {
    const [existing] = await db
      .select({ id: blogAutomationPosts.id })
      .from(blogAutomationPosts)
      .where(eq(blogAutomationPosts.slug, slug))
      .limit(1);
    if (!existing) return slug;
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}
