import crypto from "node:crypto";

import { cleanRichText, decodeHtmlEntities } from "@/lib/pipeline/content-clean";
import { extractOpenGraphImageFromHtml } from "@/lib/open-graph-image";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";

import type { SourceEvidenceCandidate, SourceEvidenceSnapshot } from "./types";

export type UrlEvidenceSnapshot = {
  title: string;
  summary: string;
  imageUrl: string | null;
};

export type UrlEvidenceInput = {
  url: string;
  title?: string | null;
  summary?: string | null;
  imageUrl?: string | null;
  metadata?: Record<string, unknown>;
  eventAt?: Date;
};

export async function extractUrlEvidenceCandidate(
  url: string
): Promise<SourceEvidenceCandidate | null> {
  const res = await safeFetchRemote(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    cache: "no-store",
  });

  if (!res?.ok) return null;

  const html = await res.text();
  return normalizeUrlEvidenceCandidate({
    url,
    ...parseUrlEvidenceHtml(html, url),
  });
}

export function normalizeUrlEvidenceCandidate(input: UrlEvidenceInput): SourceEvidenceCandidate {
  const snapshot = buildUrlEvidenceSnapshot(input);

  return {
    type: "url",
    title: snapshot.title,
    summary: snapshot.summary,
    url: snapshot.sourceUrl || undefined,
    externalId: snapshot.sourceUrl || undefined,
    eventAt: input.eventAt,
    dedupeKey: `url:${hashString(snapshot.sourceUrl || input.url)}`,
    metadata: {
      ...input.metadata,
      imageUrl: cleanOptionalValue(input.imageUrl),
    },
  };
}

export function buildUrlEvidenceSnapshot(
  input: UrlEvidenceInput
): SourceEvidenceSnapshot {
  const normalizedUrl = normalizeEvidenceUrl(input.url);
  const title = cleanValue(input.title) || normalizedUrl || "Source URL";
  const summary = cleanValue(input.summary) || title;

  return {
    sourceUrl: normalizedUrl || input.url.trim(),
    title,
    summary,
    imageUrl: cleanOptionalValue(input.imageUrl),
  };
}

export function parseUrlEvidenceHtml(
  html: string,
  baseUrl: string
): UrlEvidenceSnapshot {
  const title =
    readMetaContent(html, "property", "og:title") ||
    readMetaContent(html, "name", "twitter:title") ||
    readTitleTag(html) ||
    baseUrl;
  const summary =
    readMetaContent(html, "name", "description") ||
    readMetaContent(html, "property", "og:description") ||
    readMetaContent(html, "name", "twitter:description") ||
    "";
  const imageUrl = extractOpenGraphImageFromHtml(html, baseUrl);

  return {
    title: cleanRichText(decodeHtmlEntities(title)),
    summary: cleanRichText(decodeHtmlEntities(summary)),
    imageUrl,
  };
}

function readMetaContent(
  html: string,
  attr: "property" | "name",
  value: string
): string | null {
  const patterns = [
    new RegExp(
      `<meta[^>]*${attr}=["']${escapeRegex(value)}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(value)}["'][^>]*>`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function readTitleTag(html: string) {
  return html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
}

function normalizeEvidenceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return value.trim();
  }
}

function cleanValue(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? cleanRichText(value.trim()) : "";
}

function cleanOptionalValue(value: string | null | undefined) {
  const cleaned = cleanValue(value);
  return cleaned ? cleaned : null;
}

function hashString(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
