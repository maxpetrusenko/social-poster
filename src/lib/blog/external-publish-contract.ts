import { createHash } from "node:crypto";

export type ExternalBlogPublishPayload = {
  contractVersion?: 1 | 2 | 3;
  runId: string;
  packageId: string;
  publicationDate?: string;
  article: string;
  articleSha256: string;
  review: string;
};

export type ValidatedExternalBlogArticle = {
  title: string;
  visibleWordCount: number;
  inlineUrls: string[];
  articleSha256: string;
  warnings: string[];
};

const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]{6,160}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const INLINE_LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
const COMMONS_IMAGE_PATTERN = /^!\[[^\]]+\]\(https:\/\/upload\.wikimedia\.org\/[^\s)]+\)$/m;
const COMMONS_SOURCE_PATTERN = /\[[^\]]+\]\(https:\/\/commons\.wikimedia\.org\/wiki\/File:[^\s)]+\)/i;
const COMMONS_LICENSE_PATTERN = /\[(?:CC BY(?:-SA)? \d\.\d|CC0(?: 1\.0)?|Public domain)\]\(https:\/\/(?:www\.)?creativecommons\.org\/[^\s)]+\)/i;

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
  const contractVersion = payload.contractVersion ?? 1;
  if (![1, 2, 3].includes(contractVersion)) {
    throw new Error("Article contract version must be 1, 2, or 3.");
  }
  if (!payload.runId || !RUN_ID_PATTERN.test(payload.runId)) {
    throw new Error("A valid Hermes run ID is required.");
  }
  if (!payload.packageId || !RUN_ID_PATTERN.test(payload.packageId)) {
    throw new Error("A valid Hermes package ID is required.");
  }
  if (
    contractVersion >= 3 &&
    (!payload.publicationDate ||
      !DATE_PATTERN.test(payload.publicationDate) ||
      !Number.isFinite(Date.parse(`${payload.publicationDate}T00:00:00Z`)))
  ) {
    throw new Error("Version 3 articles require a valid publication date.");
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
  if (!/^outcome:\s*['"]?pass['"]?\s*$/im.test(payload.review)) {
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
  if (
    contractVersion >= 2 &&
    !(
      COMMONS_IMAGE_PATTERN.test(payload.article) &&
      COMMONS_SOURCE_PATTERN.test(payload.article) &&
      COMMONS_LICENSE_PATTERN.test(payload.article)
    )
  ) {
    throw new Error("Version 2 articles require one licensed Wikimedia Commons image and attribution.");
  }

  const visibleText = payload.article
    .replace(INLINE_LINK_PATTERN, "$1")
    .replace(/https?:\/\/\S+/g, "");
  const visibleWordCount = visibleText.match(/\b[\p{L}\p{N}_’'-]+\b/gu)?.length ?? 0;
  if (visibleWordCount < 1500) {
    throw new Error("Article visible word count must be at least 1500 words.");
  }
  const warnings = visibleWordCount > 2000 ? ["article_over_2000_words"] : [];
  return { title, visibleWordCount, inlineUrls: uniqueInlineUrls, articleSha256, warnings };
}
