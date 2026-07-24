import { cleanRichText } from "./content-clean";
import { findNoAiSlopIssues } from "../writing/no-ai-slop";

export type PostQualityStory = {
  title: string;
  summary?: string;
  link?: string;
  sourceName?: string;
  sourceHost?: string;
  publishedAt?: string;
};

export type SanitizedHumanPostStory = {
  title: string;
  summary: string;
  link?: string;
  sourceName?: string;
  sourceHost?: string;
  publishedAt?: string;
  summaryWasGarbage: boolean;
};

export type PostQualityResult = {
  ok: boolean;
  reasons: string[];
};

const X_LIMIT = 275;

const GARBAGE_SUMMARIES = new Set([
  "comments",
  "comments.",
  "comment",
  "comments | link",
  "link",
  "link comments",
  "points",
  "submitted",
]);

const GENERIC_PHRASES = [
  "this is important because",
  "this highlights the growing importance",
  "significantly accelerating model output",
  "game-changing",
  "pay attention",
  "worth watching",
  "breaking",
  "interesting",
];

const CREDIT_FOOTER_LINE = /^\s*(?:source|credit|credits|h\/t|via)\b\s*:?.*$/im;
const CREDIT_FOOTER_LINES = /^\s*(?:source|credit|credits|h\/t|via)\b\s*:?.*$/gim;

export function sanitizeHumanPostStory(
  story: PostQualityStory
): SanitizedHumanPostStory {
  const title = cleanRichText(story.title).trim();
  const rawSummary = cleanRichText(story.summary ?? "").trim();
  const summaryWasGarbage = isGarbageSummary(rawSummary);
  const sourceHost = story.sourceHost ?? inferHost(story.link);

  return {
    title,
    summary: summaryWasGarbage ? "" : rawSummary,
    link: story.link,
    sourceName: story.sourceName,
    sourceHost,
    publishedAt: story.publishedAt,
    summaryWasGarbage,
  };
}

export function isGarbageSummary(summary: string): boolean {
  const trimmed = cleanRichText(summary)
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed || trimmed.length < 20) return true;

  const lower = trimmed.toLowerCase();
  if (GARBAGE_SUMMARIES.has(lower)) return true;
  if (/submitted\s+by\s+\/?u\//i.test(trimmed)) return true;
  if (/\[(?:link|comments?)\]/i.test(trimmed)) return true;
  if (/\bcomments?\b/i.test(trimmed) && lower.length < 80) return true;

  const metadataOnly = lower.replace(/\[(?:link|comments?)\]/g, "").replace(/\s+/g, " ").trim();
  if (!metadataOnly || GARBAGE_SUMMARIES.has(metadataOnly)) return true;

  return false;
}

export function assessPostQuality(
  content: string,
  story: PostQualityStory,
  platform: string
): PostQualityResult {
  const text = normalizeWhitespace(content);
  const reasons: string[] = [];
  const title = cleanRichText(story.title).trim();
  const normalizedText = normalizeForCompare(text);
  const normalizedTitle = normalizeForCompare(title);

  if (!text || text.length < 35) reasons.push("empty_or_too_short");
  if (normalizePlatform(platform) === "twitter" && text.length > X_LIMIT) {
    reasons.push("x_limit");
  }
  if (/\bsubmitted\s+by\s+\/?u\//i.test(text)) reasons.push("reddit_metadata");
  if (/\[(?:link|comments?)\]/i.test(text)) reasons.push("rss_link_comments_metadata");
  if (CREDIT_FOOTER_LINE.test(content)) reasons.push("source_credit_label");
  if (/#\p{L}[\p{L}\p{N}_-]*/u.test(text)) reasons.push("hashtag");
  if (/\bBREAKING\b/i.test(text)) reasons.push("breaking");
  if (containsEmoji(text)) reasons.push("emoji");

  const titleOccurrences =
    normalizedTitle.length > 12
      ? normalizedText.split(normalizedTitle).length - 1
      : 0;
  if (titleOccurrences >= 2) reasons.push("title_repeated");

  if (startsWithExactTitle(text, title)) {
    const rest = text.slice(title.length).replace(/^[\s.:;,-]+/, "").trim();
    if (rest.length < 80 || containsGenericPhrase(rest)) {
      reasons.push("title_regurgitation");
    }
  }

  if (containsGenericPhrase(text)) reasons.push("generic_filler");
  for (const issue of findNoAiSlopIssues(content)) {
    reasons.push(`no_ai_slop:${issue.code}`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function cleanHumanPostDraft(value: string, platform: string) {
  let next = value
    .replace(/\b(source|link):\s*https?:\/\/\S+/gi, "")
    .replace(CREDIT_FOOTER_LINES, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/#[\p{L}\p{N}_-]+/gu, "")
    .replace(/\bBREAKING\b:?/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  next = stripEmoji(next);

  if (normalizePlatform(platform) === "twitter" && next.length > X_LIMIT) {
    next = next.slice(0, X_LIMIT - 1).trimEnd();
    next = next.replace(/[\s,;:.-]+$/g, "");
    next = `${next}...`;
  }

  return next;
}

export function buildDeterministicPostFallback(
  story: PostQualityStory,
  platform: string
): string {
  const sanitized = sanitizeHumanPostStory(story);
  const sourceLabel = sanitized.sourceName || sanitized.sourceHost || "The source";
  const title = shorten(stripTrailingPunctuation(sanitized.title), 140);
  const detail = firstUsefulSummarySentence(sanitized.summary, sanitized.title);

  const observation = detail
    ? `${sourceLabel}: ${shorten(stripTrailingPunctuation(detail), 150)}.`
    : `${sourceLabel}: ${title}.`;

  const draft = observation;

  const cleaned = cleanHumanPostDraft(draft, platform);
  const quality = assessPostQuality(cleaned, sanitized, platform);
  if (quality.ok) return cleaned;

  return cleanHumanPostDraft(
    `${title}.`,
    platform
  );
}

function firstUsefulSummarySentence(summary: string, title: string) {
  if (!summary || isGarbageSummary(summary)) return "";
  const titleNorm = normalizeForCompare(title);
  return summary
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .find((sentence) => {
      if (sentence.length < 25) return false;
      const sentenceNorm = normalizeForCompare(sentence);
      return sentenceNorm !== titleNorm && !sentenceNorm.includes(titleNorm);
    }) ?? "";
}

function normalizePlatform(platform: string) {
  const value = platform.toLowerCase();
  if (value === "x" || value === "twitter") return "twitter";
  if (value.startsWith("linkedin")) return "linkedin";
  return value;
}

function inferHost(value: string | undefined) {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForCompare(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function startsWithExactTitle(content: string, title: string) {
  if (!title || title.length < 12) return false;
  return content.toLowerCase().startsWith(title.toLowerCase());
}

function containsGenericPhrase(content: string) {
  const lower = content.toLowerCase();
  return GENERIC_PHRASES.some((phrase) => lower.includes(phrase));
}

function containsEmoji(value: string) {
  return /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(value);
}

function stripEmoji(value: string) {
  return value.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "");
}

function stripTrailingPunctuation(value: string) {
  return value.replace(/[.!?]+$/g, "").trim();
}

function shorten(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const clipped = value.slice(0, maxLength - 3).trimEnd();
  return `${clipped.replace(/[\s,;:.-]+$/g, "")}...`;
}
