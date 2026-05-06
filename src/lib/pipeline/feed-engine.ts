import { db } from "@/db";
import { dedupCache } from "@/db/schema";
import crypto from "node:crypto";
import { cleanRichText, decodeHtmlEntities } from "./content-clean";
import {
  DEFAULT_RSS_FEEDS,
  DEFAULT_RSS_SETTINGS,
  getWorkspaceRssSettings,
  getWorkspaceRssSources,
  type ImageSelectionMode,
} from "@/lib/rss-config";
import { fetchOpenGraphImage } from "@/lib/open-graph-image";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";

export interface Story {
  title: string;
  link: string;
  summary: string;
  score: number;
  tractionScore?: number;
  imageUrl?: string;
  publishedAt?: string;
  sourceName?: string;
}

export type FeedStoryState =
  | "selected"
  | "eligible"
  | "pool_full"
  | "too_old"
  | "low_score"
  | "already_posted"
  | "missing_fields";

export type FeedStoryDiagnostic = {
  title: string;
  link: string;
  summary: string;
  score: number;
  tractionScore: number;
  scoreBreakdown: string;
  imageUrl?: string;
  publishedAt?: string;
  sourceName: string;
  state: FeedStoryState;
};

export type FeedSourceDiagnostic = {
  sourceName: string;
  sourceUrl: string;
  weight: number;
  enabled: boolean;
  fetchedCount: number;
  selectedCount: number;
  stories: FeedStoryDiagnostic[];
};

interface FeedItem {
  title?: string;
  link?: string;
  contentSnippet?: string;
  imageUrl?: string;
  content?: string;
  pubDate?: string;
  isoDate?: string;
  commentsUrl?: string;
}

const DEFAULT_AI_KEYWORDS = new Set([
  "llm", "gpt", "claude", "ai agent", "rag", "transformer", "neural",
  "deep learning", "machine learning", "artificial intelligence", "generative ai",
  "foundation model", "large language model", "nlp", "openai", "anthropic",
  "mistral", "gemini", "llama", "embeddings", "vector database",
  "prompt engineering", "fine-tuning", "open weights", "inference",
  "tokens", "context window", "multimodal", "reasoning", "chain of thought",
]);

type FeedSource = { url: string; name: string; weight: number; enabled?: boolean };

type FeedSelectionConfig = {
  feeds: FeedSource[];
  candidateWindowHours: number;
  candidatePoolSize: number;
  minimumScore: number;
  tractionWeight: number;
  keywordBoostTerms: string[];
};

type RankedFeedItem = FeedItem & {
  feedWeight: number;
  feedName: string;
  feedUrl: string;
  tractionScore: number;
  tractionSignals: string[];
  computedScore: number;
  freshnessScore: number;
  relevanceScore: number;
  sourceWeightScore: number;
};

async function fetchFeed(feed: { url: string; name: string }): Promise<FeedItem[]> {
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "social-poster/1.0" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssXml(xml);
  } catch (err) {
    console.warn(`[feed] ${feed.name} failed: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function normalizeDedupKey(link: string) {
  return link.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function parseRssXml(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>|<entry[\s>]([\s\S]*?)<\/entry>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1] || match[2] || "";
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractAttr(block, "link", "href");
    const desc = extractTag(block, "description") || extractTag(block, "summary") || extractTag(block, "content");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "published") || extractTag(block, "updated");
    const commentsUrl = extractTag(block, "comments");
    const imageUrl = extractImageUrl(block, link);
    items.push({
      title: title ? cleanRichText(title) : undefined,
      link,
      contentSnippet: desc ? cleanSummaryText(desc).slice(0, 500) : undefined,
      imageUrl,
      pubDate,
      commentsUrl,
    });
  }
  return items;
}

function extractTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  return m ? (m[1] || m[2] || "").trim() : undefined;
}

function extractAttr(xml: string, tag: string, attr: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*${attr}=["']([^"']*)["']`, "i");
  const m = xml.match(re);
  return m?.[1];
}

function extractImageUrl(xml: string, baseUrl: string | undefined): string | undefined {
  const candidates = [
    extractAttr(xml, "enclosure", "url"),
    extractAttr(xml, "media:content", "url"),
    extractAttr(xml, "media:thumbnail", "url"),
    extractAttr(xml, "itunes:image", "href"),
    extractTag(xml, "media:content"),
    extractFirstImageSrc(xml),
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate, baseUrl);
    if (normalized) return normalized;
  }

  return undefined;
}

function extractFirstImageSrc(value: string): string | undefined {
  const match = value.match(/<img[^>]*src=["']([^"']+)["']/i);
  return match?.[1];
}

function normalizeUrl(value: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const decoded = decodeHtmlEntities(value);
    const normalized = baseUrl ? new URL(decoded, baseUrl).toString() : new URL(decoded).toString();
    return /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(normalized) || normalized.includes("/image")
      ? normalized
      : normalized;
  } catch {
    return undefined;
  }
}

function cleanSummaryText(value: string): string {
  return cleanRichText(value)
    .replace(/^https?:\/\/\S+\.(?:png|jpe?g|gif|webp|svg)\S*\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHackerNewsItemId(item: FeedItem) {
  const match = item.commentsUrl?.match(/item\?id=(\d+)/i);
  return match?.[1] ?? null;
}

function extractRedditPostId(item: FeedItem) {
  const source = item.link ?? item.commentsUrl ?? "";
  const match = source.match(/comments\/([a-z0-9]+)\//i);
  return match?.[1] ?? null;
}

async function fetchHackerNewsTraction(itemId: string) {
  try {
    const response = await fetch(`https://hn.algolia.com/api/v1/items/${itemId}`, {
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": "social-poster/1.0" },
    });
    if (!response.ok) return null;

    const body = (await response.json()) as {
      points?: number;
      children?: Array<unknown>;
    };
    const points = body.points ?? 0;
    const commentCount = Array.isArray(body.children) ? body.children.length : 0;
    const tractionScore = Math.min(10, Math.log10(points + commentCount * 2 + 1) * 3.4);

    return {
      tractionScore,
      signals: [`HN ${points} points`, `${commentCount} comments`],
    };
  } catch {
    return null;
  }
}

async function fetchRedditTraction(postId: string) {
  try {
    const response = await fetch(
      `https://www.reddit.com/comments/${postId}.json?raw_json=1&limit=1`,
      {
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "social-poster/1.0" },
      }
    );
    if (!response.ok) return null;

    const body = (await response.json()) as Array<{
      data?: {
        children?: Array<{
          data?: {
            score?: number;
            num_comments?: number;
            upvote_ratio?: number;
          };
        }>;
      };
    }>;

    const post = body[0]?.data?.children?.[0]?.data;
    if (!post) return null;

    const score = post.score ?? 0;
    const comments = post.num_comments ?? 0;
    const upvoteRatio = post.upvote_ratio ?? 0;
    const tractionScore = Math.min(
      10,
      Math.log10(score + comments * 2 + 1) * (upvoteRatio > 0.9 ? 3.5 : 3)
    );

    return {
      tractionScore,
      signals: [`Reddit ${score} score`, `${comments} comments`],
    };
  } catch {
    return null;
  }
}

async function resolveTraction(item: FeedItem) {
  const hackerNewsId = extractHackerNewsItemId(item);
  if (hackerNewsId) {
    return (await fetchHackerNewsTraction(hackerNewsId)) ?? {
      tractionScore: 0,
      signals: [],
    };
  }

  const redditPostId = extractRedditPostId(item);
  if (redditPostId) {
    return (await fetchRedditTraction(redditPostId)) ?? {
      tractionScore: 0,
      signals: [],
    };
  }

  return {
    tractionScore: 0,
    signals: [],
  };
}

function scoreItem(
  item: FeedItem,
  feedWeight: number,
  tractionWeight: number,
  tractionScore: number,
  keywordBoostTerms: string[]
): {
  total: number;
  freshnessScore: number;
  relevanceScore: number;
  sourceWeightScore: number;
} {
  let freshnessScore = 10;
  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    freshnessScore = Math.max(0, 28 - ageH * 0.35);
  }

  let relevanceScore = 0;
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();
  let kwHits = 0;
  const keywords = new Set([
    ...DEFAULT_AI_KEYWORDS,
    ...keywordBoostTerms.map((term) => term.toLowerCase()),
  ]);
  for (const kw of keywords) {
    if (text.includes(kw)) kwHits++;
  }
  relevanceScore += Math.min(24, kwHits * 4);
  if (item.title && item.title.length > 20 && item.title.length < 120) {
    relevanceScore += 4;
  }

  const sourceWeightScore = feedWeight;
  const total =
    freshnessScore +
    relevanceScore +
    sourceWeightScore +
    tractionScore * (tractionWeight / 10);

  return {
    total: Math.round(total),
    freshnessScore: Math.round(freshnessScore),
    relevanceScore: Math.round(relevanceScore),
    sourceWeightScore,
  };
}

async function resolveFeedSelectionConfig(
  workspaceId?: string | null
): Promise<FeedSelectionConfig> {
  if (!workspaceId) {
    return {
      feeds: DEFAULT_RSS_FEEDS,
      candidateWindowHours: DEFAULT_RSS_SETTINGS.candidateWindowHours,
      candidatePoolSize: DEFAULT_RSS_SETTINGS.candidatePoolSize,
      minimumScore: DEFAULT_RSS_SETTINGS.minimumScore,
      tractionWeight: DEFAULT_RSS_SETTINGS.tractionWeight,
      keywordBoostTerms: DEFAULT_RSS_SETTINGS.keywordBoostTerms,
    };
  }

  const [feeds, settings] = await Promise.all([
    getWorkspaceRssSources(workspaceId),
    getWorkspaceRssSettings(workspaceId),
  ]);

  return {
    feeds: feeds.filter((feed) => feed.enabled),
    candidateWindowHours: settings.candidateWindowHours,
    candidatePoolSize: settings.candidatePoolSize,
    minimumScore: settings.minimumScore,
    tractionWeight: settings.tractionWeight,
    keywordBoostTerms: settings.keywordBoostTerms,
  };
}

async function loadRankedFeedItems(
  config: FeedSelectionConfig
): Promise<RankedFeedItem[]> {
  const results = await Promise.allSettled(
    config.feeds.map(async (feed) => {
      const items = await fetchFeed(feed);
      return Promise.all(
        items.map(async (item) => {
          const traction = await resolveTraction(item);
          const score = scoreItem(
            item,
            feed.weight,
            config.tractionWeight,
            traction.tractionScore,
            config.keywordBoostTerms
          );

          return {
            ...item,
            feedWeight: feed.weight,
            feedName: feed.name,
            feedUrl: feed.url,
            tractionScore: Math.round(traction.tractionScore * 10) / 10,
            tractionSignals: traction.signals,
            computedScore: score.total,
            freshnessScore: score.freshnessScore,
            relevanceScore: score.relevanceScore,
            sourceWeightScore: score.sourceWeightScore,
          };
        })
      );
    })
  );

  const allItems: RankedFeedItem[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  allItems.sort((a, b) => b.computedScore - a.computedScore);
  return allItems;
}

async function analyzeCandidates({
  count,
  maxAgeHours,
  workspaceId,
}: {
  count: number;
  maxAgeHours: number;
  workspaceId?: string | null;
}) {
  const config = await resolveFeedSelectionConfig(workspaceId);
  const allItems = await loadRankedFeedItems(config);
  const cached = await db.select({ key: dedupCache.key }).from(dedupCache);
  const usedKeys = new Set(cached.map((row) => row.key));

  const stories: Story[] = [];
  const diagnostics: FeedStoryDiagnostic[] = [];

  for (const item of allItems) {
    const title = item.title?.trim() ?? "";
    const link = item.link?.trim() ?? "";
    const summary = item.contentSnippet || "";
    const withinWindow = isWithinWindow(item.pubDate, maxAgeHours);
    const dedupKey = link ? normalizeDedupKey(link) : "";

    let state: FeedStoryState = "eligible";
    if (!title || !link) {
      state = "missing_fields";
    } else if (!withinWindow) {
      state = "too_old";
    } else if (item.computedScore < config.minimumScore) {
      state = "low_score";
    } else if (usedKeys.has(dedupKey)) {
      state = "already_posted";
    } else if (stories.length >= count) {
      state = "pool_full";
    } else {
      state = "selected";
      stories.push({
        title,
        link,
        summary,
        score: item.computedScore,
        tractionScore: item.tractionScore,
        imageUrl: item.imageUrl,
        publishedAt: item.pubDate,
        sourceName: item.feedName,
      });
    }

    diagnostics.push({
      title: title || "(missing title)",
      link,
      summary,
      score: item.computedScore,
      tractionScore: item.tractionScore,
      scoreBreakdown: [
        `freshness ${item.freshnessScore}`,
        `relevance ${item.relevanceScore}`,
        `source ${item.sourceWeightScore}`,
        item.tractionSignals.length
          ? `traction ${item.tractionScore} (${item.tractionSignals.join(", ")})`
          : `traction ${item.tractionScore}`,
      ].join(" + "),
      imageUrl: item.imageUrl,
      publishedAt: item.pubDate,
      sourceName: item.feedName,
      state,
    });
  }

  return {
    stories,
    diagnostics,
    config,
  };
}

export async function getTopStories(
  count = 3,
  options?: { workspaceId?: string | null }
): Promise<Story[]> {
  const { stories } = await analyzeCandidates({
    count,
    maxAgeHours: (await resolveFeedSelectionConfig(options?.workspaceId))
      .candidateWindowHours,
    workspaceId: options?.workspaceId,
  });
  return stories;
}

export async function getCandidateStories({
  count = 6,
  maxAgeHours = 48,
  workspaceId,
}: {
  count?: number;
  maxAgeHours?: number;
  workspaceId?: string | null;
} = {}): Promise<Story[]> {
  const config = await resolveFeedSelectionConfig(workspaceId);
  const { stories } = await analyzeCandidates({
    count,
    maxAgeHours: Math.min(maxAgeHours, config.candidateWindowHours),
    workspaceId,
  });
  return stories;
}

export async function getFeedSourceDiagnostics({
  workspaceId,
}: {
  workspaceId?: string | null;
} = {}): Promise<FeedSourceDiagnostic[]> {
  const config = await resolveFeedSelectionConfig(workspaceId);
  const { diagnostics } = await analyzeCandidates({
    count: config.candidatePoolSize,
    maxAgeHours: config.candidateWindowHours,
    workspaceId,
  });

  return config.feeds.map((feed) => {
    const stories = diagnostics.filter((story) => story.sourceName === feed.name);
    return {
      sourceName: feed.name,
      sourceUrl: feed.url,
      weight: feed.weight,
      enabled: feed.enabled !== false,
      fetchedCount: stories.length,
      selectedCount: stories.filter((story) => story.state === "selected").length,
      stories,
    };
  });
}

export async function resolveStoryImageUrl(
  story: Story,
  mode: ImageSelectionMode
): Promise<string | null> {
  const feedImage = story.imageUrl ? await verifySourceImageUrl(story.imageUrl) : null;

  if (mode === "feed_only") {
    return feedImage;
  }

  if (mode === "prefer_open_graph") {
    const openGraphImage = await resolveVerifiedOpenGraphImage(story.link);
    return openGraphImage ?? feedImage;
  }

  return feedImage ?? (await resolveVerifiedOpenGraphImage(story.link));
}

export async function resolveVerifiedOpenGraphImage(url: string): Promise<string | null> {
  if (!url) return null;
  const openGraphImage = await fetchOpenGraphImage(url);
  if (!openGraphImage) return null;
  return verifySourceImageUrl(openGraphImage);
}

export async function verifySourceImageUrl(url: string): Promise<string | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (hasUnsafeImageUrlHint(url)) return null;

  try {
    const response = await safeFetchRemote(url, {
      signal: AbortSignal.timeout(8_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Range: "bytes=0-4095",
      },
    });

    if (!response?.ok) return null;
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.startsWith("image/")) return url;
    return null;
  } catch {
    return null;
  }
}

function hasUnsafeImageUrlHint(url: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    if (
      /(?:^|[-_/])(1x1|pixel|tracking|tracker|spacer|blank|transparent|placeholder|default|fallback)(?:[-_.;/]|$)/i.test(
        pathname
      )
    ) {
      return true;
    }
    if (/(?:^|[-_/])external-preview(?:[-_/]|$)/i.test(pathname)) {
      return true;
    }
    const dimensionHint = pathname.match(/(?:^|[-_/])(\d{1,4})x(\d{1,4})(?:[-_.;/]|$)/i);
    if (dimensionHint) {
      const width = Number(dimensionHint[1]);
      const height = Number(dimensionHint[2]);
      if (width > 0 && height > 0 && (width < 300 || height < 160)) return true;
    }
    for (const key of ["width", "w"]) {
      const width = Number(parsed.searchParams.get(key));
      if (Number.isFinite(width) && width > 0 && width < 300) return true;
    }
    for (const key of ["height", "h"]) {
      const height = Number(parsed.searchParams.get(key));
      if (Number.isFinite(height) && height > 0 && height < 160) return true;
    }
  } catch {
    return false;
  }
  return false;
}
function isWithinWindow(pubDate: string | undefined, maxAgeHours: number): boolean {
  if (!pubDate) return true;
  const ageMs = Date.now() - new Date(pubDate).getTime();
  return ageMs <= maxAgeHours * 60 * 60 * 1000;
}

export async function markPosted(story: Story): Promise<void> {
  const key = story.link.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  try {
    await db.insert(dedupCache).values({
      id: crypto.randomUUID(),
      key,
      source: story.title.slice(0, 200),
      createdAt: new Date(),
    });
  } catch {
    // dupe key, fine
  }
}

/** Insert arbitrary keys into dedup_cache (e.g. gh-event:{id} for agent persona dedup). */
export async function markDedupKeys(
  keys: string[],
  source: string
): Promise<void> {
  const now = new Date();
  for (const key of keys) {
    try {
      await db.insert(dedupCache).values({
        id: crypto.randomUUID(),
        key,
        source: source.slice(0, 200),
        createdAt: now,
      });
    } catch {
      // dupe key, fine
    }
  }
}
