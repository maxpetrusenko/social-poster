import "server-only";

import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeArticleWorkspaceOpenRef } from "@/lib/article-agent/workspace";
import type { FrameworkValidation, BlogDraft } from "@/lib/blog/framework";

type SaveGeneratedArticleWorkspaceInput = {
  draft: BlogDraft;
  preferredSlug: string;
  provider: string;
  validation: FrameworkValidation;
  postId: string;
  sourceUrls?: string[];
  createdByEmail?: string;
  generatedAt: Date;
  raw?: unknown;
};

export async function saveGeneratedArticleToWorkspace(input: SaveGeneratedArticleWorkspaceInput) {
  const articlesRoot = getArticleWorkspaceArticlesRoot();
  await mkdir(articlesRoot, { recursive: true });

  const slug = await uniqueWorkspaceSlug(articlesRoot, input.preferredSlug);
  const articleDir = path.join(articlesRoot, slug);
  const evalsDir = path.join(articleDir, "evals");
  const sourcesDir = path.join(articleDir, "sources");
  const artifactsDir = path.join(articleDir, "artifacts");
  await Promise.all([
    mkdir(evalsDir, { recursive: true }),
    mkdir(sourcesDir, { recursive: true }),
    mkdir(artifactsDir, { recursive: true }),
  ]);

  const generatedAt = input.generatedAt.toISOString();
  const wordCount = countWords(input.draft.contentMarkdown);
  const evidenceCount = input.draft.sources.length;
  const articleFile = "article-v1.md";

  await writeFile(path.join(articleDir, articleFile), ensureTrailingNewline(input.draft.contentMarkdown), "utf8");
  await writeJson(path.join(articleDir, "version.json"), {
    slug,
    version: "v1",
    title: input.draft.title,
    subtitle: input.draft.excerpt,
    sourceUrl: input.sourceUrls?.[0] ?? null,
    sourceUrls: input.sourceUrls ?? [],
    articleFile,
    iterationCount: 1,
    frameworkScore: input.validation.score,
    frameworkMaxScore: 110,
    wordCount,
    evidenceCount,
    heroImageUrl: input.draft.heroImageUrl,
    heroImageStatus: input.draft.heroImageUrl ? "generated_or_imported" : "missing",
    ratingStatus: "pending",
    workflowFile: "workflow.json",
    overviewFile: "overview.md",
    createdAt: generatedAt,
    generatedAt,
    createdByEmail: input.createdByEmail,
    generatorProvider: input.provider,
    databasePostId: input.postId,
    externalDraftPath: input.draft.externalDraftPath,
    mediumArticleId: input.draft.mediumArticleId,
    mediumUrl: input.draft.mediumUrl,
    notes: "Generated via the canonical New Article button and saved as a filesystem article workspace package.",
  });
  await writeJson(path.join(articleDir, "import-manifest.json"), {
    slug,
    title: input.draft.title,
    subtitle: input.draft.excerpt,
    heroImageUrl: input.draft.heroImageUrl,
    sourceRoot: "new-article-button",
    sourceKind: "generated",
    sourcePath: input.sourceUrls?.[0] ?? "manual prompt",
    status: input.validation.status === "fail" ? "needs_review" : "draft",
    versions: [{ version: "v1", sourceFile: articleFile }],
    artifactCount: 4,
    importedAt: generatedAt,
    databasePostId: input.postId,
  });
  await writeJson(path.join(evalsDir, "framework-check-v1.json"), {
    kind: "source-of-truth-framework-check",
    generatedAt,
    provider: input.provider,
    score: input.validation.score,
    maxScore: 110,
    status: input.validation.status,
    checks: input.validation.checks,
    wordCount,
    evidenceCount,
    articleOpenRef: makeArticleWorkspaceOpenRef("articles", `${slug}/${articleFile}`),
  });
  await writeJson(path.join(sourcesDir, "sources.json"), {
    generatedAt,
    sourceUrls: input.sourceUrls ?? [],
    extractedSources: input.draft.sources,
  });
  await writeJson(path.join(artifactsDir, "generation-raw.json"), {
    generatedAt,
    provider: input.provider,
    raw: input.raw ?? null,
  });
  await writeFile(
    path.join(articleDir, "overview.md"),
    buildOverviewMarkdown({
      title: input.draft.title,
      provider: input.provider,
      validation: input.validation,
      wordCount,
      evidenceCount,
      generatedAt,
    }),
    "utf8"
  );
  await writeJson(path.join(articleDir, "workflow.json"), {
    kind: "article-generation-workflow",
    generatedAt,
    articleRelativePath: `${slug}/${articleFile}`,
    frameworkScore: input.validation.score,
    frameworkMaxScore: 110,
    provider: input.provider,
    wordCount,
    evidenceCount,
    phases: [
      {
        name: "1_generate_article_button",
        status: "completed",
        model: input.provider,
        notes: "Canonical New Article button generated the article and wrote the filesystem workspace package.",
      },
      {
        name: "2_framework_validation",
        status: input.validation.status,
        rating: input.validation.score,
        notes: `${input.validation.checks.length} framework checks stored in evals/framework-check-v1.json.`,
      },
    ],
  });

  return {
    slug,
    articleRelativePath: `${slug}/${articleFile}`,
    openRef: makeArticleWorkspaceOpenRef("articles", `${slug}/${articleFile}`),
    folderOpenRef: makeArticleWorkspaceOpenRef("articles", slug),
  };
}

function getArticleWorkspaceArticlesRoot() {
  const workspaceRoot = process.env.ARTICLE_WORKSPACE_DIR || path.join(process.cwd(), "data", "article-workspace");
  return path.join(workspaceRoot, "articles");
}

async function uniqueWorkspaceSlug(articlesRoot: string, preferredSlug: string) {
  const base = sanitizeSlug(preferredSlug) || "article";
  let slug = base;
  let suffix = 2;
  while (await exists(path.join(articlesRoot, slug))) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  return slug;
}

function sanitizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90)
    .replace(/-+$/g, "");
}

async function exists(filePath: string) {
  return Boolean(await stat(filePath).catch(() => null));
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function ensureTrailingNewline(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

async function writeJson(filePath: string, value: unknown) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildOverviewMarkdown(input: {
  title: string;
  provider: string;
  validation: FrameworkValidation;
  wordCount: number;
  evidenceCount: number;
  generatedAt: string;
}) {
  return `---
title: ${input.title}
source: new-article-button
published: false
created: ${input.generatedAt.slice(0, 10)}
framework_score: ${input.validation.score}/110
provider: ${input.provider}
word_count: ${input.wordCount}
evidence_count: ${input.evidenceCount}
iterations: 1
mode: filesystem
---

# Article Overview

Generated via the canonical New Article button and saved as a filesystem article workspace package.

## Phase Log

| Step | Status | Time | Cost | LLM/Tool | Rating | Notes |
|------|--------|------|------|----------|--------|-------|
| 1_generate_article_button | completed | - | - | ${input.provider} | - | Generated from /dashboard/articles/new |
| 2_framework_validation | ${input.validation.status} | - | - | source-of-truth framework | ${input.validation.score}/110 | ${input.validation.checks.length} checks |
| TOTAL | ${input.validation.status} | - | - | - | ${input.validation.score}/110 | Filesystem package ready |
`;
}
