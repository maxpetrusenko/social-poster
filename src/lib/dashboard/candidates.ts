import { db } from "@/db";
import { candidateCache } from "@/db/schema";
import { getCandidateStories, type Story } from "@/lib/pipeline/feed-engine";
import { desc } from "drizzle-orm";
import { shouldRefreshCandidateCache } from "./candidate-cache-policy";
import { decodeHtmlEntities } from "@/lib/pipeline/content-clean";

export type DashboardCandidate = Story & {
  ogImageUrl: string | null;
  previewImageUrl: string | null;
  sourceHost: string;
  fetchedAt?: string;
};

const CANDIDATE_CACHE_SOURCE_COUNT = 40;
const CANDIDATE_CACHE_SIZE = 24;

let refreshInFlight: Promise<void> | null = null;

export async function getDashboardCandidates(count = 6): Promise<DashboardCandidate[]> {
  const cached = await loadCachedCandidates();
  const isStale = shouldRefreshCandidateCache(cached[0]?.fetchedAt ? new Date(cached[0].fetchedAt) : null);

  if (cached.length === 0) {
    await refreshCandidateCache();
    return (await loadCachedCandidates()).slice(0, count);
  }

  if (isStale) {
    void refreshCandidateCache();
  }

  return cached.slice(0, count);
}

export async function primeDashboardCandidates(): Promise<void> {
  const cached = await loadCachedCandidates();
  if (cached.length === 0 || shouldRefreshCandidateCache(cached[0]?.fetchedAt ? new Date(cached[0].fetchedAt) : null)) {
    await refreshCandidateCache();
  }
}

async function loadCachedCandidates(): Promise<DashboardCandidate[]> {
  const rows = await db
    .select()
    .from(candidateCache)
    .orderBy(
      desc(candidateCache.score),
      desc(candidateCache.publishedAt),
      desc(candidateCache.fetchedAt)
    );

  return rows
    .map((row) => ({
      title: row.title,
      link: row.link,
      summary: row.summary,
      score: row.score,
      imageUrl: row.imageUrl ?? undefined,
      ogImageUrl: row.ogImageUrl,
      previewImageUrl: getImagePreviewUrl(row.ogImageUrl),
      sourceName: row.sourceName ?? undefined,
      sourceHost: getSourceHost(row.link),
      publishedAt: row.publishedAt?.toISOString(),
      fetchedAt: row.fetchedAt.toISOString(),
    }))
    .sort((a, b) => compareCandidatePriority(a, b));
}

async function refreshCandidateCache(): Promise<void> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const stories = await getCandidateStories({
      count: CANDIDATE_CACHE_SOURCE_COUNT,
      maxAgeHours: 48,
    });
    const rows = await Promise.all(
      stories.map(async (story) => {
        const ogImageUrl = story.imageUrl ?? await fetchOpenGraphImage(story.link);
        return {
          link: story.link,
          title: story.title,
          summary: story.summary,
          score: story.score,
          imageUrl: story.imageUrl ?? null,
          ogImageUrl,
          sourceName: story.sourceName ?? null,
          publishedAt: story.publishedAt ? new Date(story.publishedAt) : null,
          fetchedAt: new Date(),
        };
      })
    );

    if (rows.length === 0) return;

    const prioritizedRows = rows
      .sort((a, b) => compareCacheRowPriority(a, b))
      .slice(0, CANDIDATE_CACHE_SIZE);

    await db.delete(candidateCache);
    await db.insert(candidateCache).values(prioritizedRows);
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

async function fetchOpenGraphImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "social-poster/1.0" },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const html = await res.text();
    const image =
      matchMetaContent(html, "property", "og:image") ||
      matchMetaContent(html, "property", "og:image:secure_url") ||
      matchMetaContent(html, "name", "twitter:image") ||
      matchMetaContent(html, "property", "og:image:url");

    if (!image) return null;
    return new URL(decodeHtmlEntities(image), url).toString();
  } catch {
    return null;
  }
}

function getImagePreviewUrl(url: string | null): string | null {
  if (!url) return null;
  return `/api/og-image?${new URLSearchParams({ url }).toString()}`;
}

function matchMetaContent(html: string, attr: "property" | "name", value: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escapeRegex(value)}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(value)}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function compareCandidatePriority(a: DashboardCandidate, b: DashboardCandidate): number {
  const imageDelta = Number(Boolean(b.ogImageUrl)) - Number(Boolean(a.ogImageUrl));
  if (imageDelta !== 0) return imageDelta;
  return b.score - a.score;
}

function compareCacheRowPriority(
  a: { ogImageUrl: string | null; score: number; publishedAt: Date | null },
  b: { ogImageUrl: string | null; score: number; publishedAt: Date | null }
): number {
  const imageDelta = Number(Boolean(b.ogImageUrl)) - Number(Boolean(a.ogImageUrl));
  if (imageDelta !== 0) return imageDelta;

  const scoreDelta = b.score - a.score;
  if (scoreDelta !== 0) return scoreDelta;

  return (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);
}
