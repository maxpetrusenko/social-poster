import { createHash } from "node:crypto";

export type ExternalBlogPublishPayload = {
  runId: string;
  packageId: string;
  article: string;
  articleSha256: string;
  review: string;
};

export type ValidatedExternalBlogArticle = {
  title: string;
  visibleWordCount: number;
  inlineUrls: string[];
  articleSha256: string;
};

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]{6,160}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const INLINE_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

export function isBlogPublishAuthorized(
  authorizationHeader: string | null,
  expectedToken: string | undefined,
) {
  return Boolean(expectedToken && authorizationHeader === `Bearer ${expectedToken}`);
}

export function validateExternalBlogPublishPayload(
  value: unknown,
): ValidatedExternalBlogArticle {
  if (!value || typeof value !== "object") {
    throw new Error("Publish payload must be an object.");
  }
  const payload = value as Partial<ExternalBlogPublishPayload>;
  if (!payload.runId || !RUN_ID_PATTERN.test(payload.runId)) {
    throw new Error("A valid Hermes run ID is required.");
  }
  if (!payload.packageId || !RUN_ID_PATTERN.test(payload.packageId)) {
    throw new Error("A valid Hermes package ID is required.");
  }
  if (!payload.article || payload.article.length > 150_000) {
    throw new Error("Article content is required and must be under 150 KB.");
  }
  if (!payload.review || payload.review.length > 100_000) {
    throw new Error("Review evidence is required and must be under 100 KB.");
  }
  if (!payload.articleSha256 || !SHA256_PATTERN.test(payload.articleSha256)) {
    throw new Error("A lowercase SHA-256 article hash is required.");
  }

  const articleSha256 = createHash("sha256").update(payload.article).digest("hex");
  if (articleSha256 !== payload.articleSha256) {
    throw new Error("Article SHA-256 does not match the supplied hash.");
  }
  if (!payload.review.includes(articleSha256)) {
    throw new Error("Review is not bound to the exact article SHA-256.");
  }
  if (!/^outcome:\s*pass\s*$/im.test(payload.review)) {
    throw new Error("Review outcome must be pass.");
  }

  const title = payload.article.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!title || title.length > 180) {
    throw new Error("Article must have one valid H1 title.");
  }
  const inlineUrls = [...payload.article.matchAll(INLINE_LINK_PATTERN)].map((match) => match[2]);
  const uniqueInlineUrls = [...new Set(inlineUrls)];
  if (uniqueInlineUrls.length < 5) {
    throw new Error("Article must include at least five unique inline source links.");
  }

  const visibleText = payload.article
    .replace(INLINE_LINK_PATTERN, "$1")
    .replace(/[`*_>#~-]/g, " ");
  const visibleWordCount = visibleText.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’.-]*\b/gu)?.length ?? 0;
  if (visibleWordCount < 1500 || visibleWordCount > 2000) {
    throw new Error("Article visible word count must be between 1500 and 2000 words.");
  }
  return { title, visibleWordCount, inlineUrls: uniqueInlineUrls, articleSha256 };
}
