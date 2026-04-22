import crypto from "node:crypto";

import { cleanRichText, decodeHtmlEntities } from "@/lib/pipeline/content-clean";

import type { SourceEvidenceCandidate } from "./types";

export type RssItemLike = {
  title?: string | null;
  link?: string | null;
  contentSnippet?: string | null;
  summary?: string | null;
  content?: string | null;
  publishedAt?: string | null;
  sourceName?: string | null;
  imageUrl?: string | null;
};

export function normalizeRssEvidenceCandidate(
  item: RssItemLike,
  sourceUrl?: string
): SourceEvidenceCandidate | null {
  const title = cleanValue(item.title);
  const url = normalizeCandidateUrl(item.link);
  const summary = cleanSummary(item.contentSnippet ?? item.summary ?? item.content);

  if (!title && !summary && !url) return null;

  const fallbackTitle = title || summary || url || "RSS item";
  const dedupeSeed = url ?? `${sourceUrl ?? "rss"}:${fallbackTitle}`;

  return {
    type: "rss_item",
    title: title || fallbackTitle,
    summary: summary || title || fallbackTitle,
    url: url ?? undefined,
    externalId: url ?? undefined,
    eventAt: parseDate(item.publishedAt),
    dedupeKey: `rss:${hashString(dedupeSeed)}`,
    metadata: {
      sourceName: cleanOptionalValue(item.sourceName),
      imageUrl: cleanOptionalValue(item.imageUrl),
      sourceUrl: sourceUrl ?? null,
    },
  };
}

function cleanValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? cleanRichText(value.trim()) : "";
}

function cleanOptionalValue(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : null;
}

function cleanSummary(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : "";
}

function normalizeCandidateUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    const url = new URL(decodeHtmlEntities(value));
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function hashString(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function parseDate(value: string | null | undefined) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

