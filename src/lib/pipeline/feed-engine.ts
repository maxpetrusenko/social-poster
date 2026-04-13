import { db } from "@/db";
import { dedupCache } from "@/db/schema";
import crypto from "node:crypto";
import { cleanRichText, decodeHtmlEntities } from "./content-clean";

export interface Story {
  title: string;
  link: string;
  summary: string;
  score: number;
  imageUrl?: string;
  publishedAt?: string;
  sourceName?: string;
}

interface FeedItem {
  title?: string;
  link?: string;
  contentSnippet?: string;
  imageUrl?: string;
  content?: string;
  pubDate?: string;
  isoDate?: string;
}

const FEEDS: { url: string; name: string; weight: number }[] = [
  { url: "https://news.ycombinator.com/rss", name: "HN", weight: 20 },
  { url: "https://techcrunch.com/feed/", name: "TechCrunch", weight: 15 },
  { url: "https://www.theverge.com/rss/index.xml", name: "The Verge", weight: 15 },
  { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars", weight: 12 },
  { url: "https://www.wired.com/feed/rss", name: "Wired", weight: 12 },
  { url: "https://blog.google/technology/ai/rss/", name: "Google AI", weight: 18 },
  { url: "https://openai.com/blog/rss.xml", name: "OpenAI", weight: 18 },
  { url: "https://www.anthropic.com/feed.xml", name: "Anthropic", weight: 18 },
  { url: "https://ai.meta.com/blog/rss/", name: "Meta AI", weight: 16 },
  { url: "https://www.reddit.com/r/MachineLearning/.rss", name: "r/ML", weight: 14 },
  { url: "https://www.reddit.com/r/LocalLLaMA/.rss", name: "r/LocalLLaMA", weight: 14 },
  { url: "https://www.reddit.com/r/artificial/.rss", name: "r/AI", weight: 12 },
  { url: "https://huggingface.co/blog/feed.xml", name: "HuggingFace", weight: 16 },
  { url: "https://lilianweng.github.io/index.xml", name: "Lilian Weng", weight: 14 },
  { url: "https://simonwillison.net/atom/everything/", name: "Simon Willison", weight: 15 },
  { url: "https://www.marktechpost.com/feed/", name: "MarkTechPost", weight: 10 },
  { url: "https://www.kdnuggets.com/feed", name: "KDnuggets", weight: 10 },
  { url: "https://blog.langchain.dev/rss/", name: "LangChain", weight: 14 },
  { url: "https://www.infoq.com/ai-ml-data-eng/rss/", name: "InfoQ AI", weight: 12 },
  { url: "https://syncedreview.com/feed/", name: "Synced", weight: 10 },
  { url: "https://thenewstack.io/blog/feed/", name: "NewStack", weight: 10 },
  { url: "https://spectrum.ieee.org/feeds/feed.rss", name: "IEEE", weight: 12 },
  { url: "https://venturebeat.com/category/ai/feed/", name: "VentureBeat AI", weight: 12 },
  { url: "https://www.deeplearning.ai/the-batch/feed/", name: "The Batch", weight: 14 },
  { url: "https://bair.berkeley.edu/blog/feed.xml", name: "BAIR", weight: 14 },
];

const AI_KEYWORDS = new Set([
  "llm", "gpt", "claude", "ai agent", "rag", "transformer", "neural",
  "deep learning", "machine learning", "artificial intelligence", "generative ai",
  "foundation model", "large language model", "nlp", "openai", "anthropic",
  "mistral", "gemini", "llama", "embeddings", "vector database",
  "prompt engineering", "fine-tuning", "open weights", "inference",
  "tokens", "context window", "multimodal", "reasoning", "chain of thought",
]);

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
    const imageUrl = extractImageUrl(block, link);
    items.push({
      title: title ? cleanRichText(title) : undefined,
      link,
      contentSnippet: desc ? cleanSummaryText(desc).slice(0, 500) : undefined,
      imageUrl,
      pubDate,
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

function scoreItem(item: FeedItem, feedWeight: number): number {
  let score = 0;
  // Recency
  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3.6e6;
    score += Math.max(0, 40 - ageH * 0.5);
  } else {
    score += 10;
  }
  // Feed weight
  score += feedWeight;
  // AI keyword bonus
  const text = `${item.title || ""} ${item.contentSnippet || ""}`.toLowerCase();
  let kwHits = 0;
  for (const kw of AI_KEYWORDS) {
    if (text.includes(kw)) kwHits++;
  }
  score += Math.min(30, kwHits * 5);
  // Title quality
  if (item.title && item.title.length > 20 && item.title.length < 120) score += 5;
  return Math.round(score);
}

export async function getTopStories(count = 3): Promise<Story[]> {
  console.log(`[feed] pulling from ${FEEDS.length} feeds`);

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const items = await fetchFeed(feed);
      return items.map((item) => ({ ...item, feedWeight: feed.weight, feedName: feed.name }));
    })
  );

  const allItems: (FeedItem & { feedWeight: number; computedScore: number; feedName: string })[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        allItems.push({ ...item, computedScore: scoreItem(item, item.feedWeight) });
      }
    }
  }

  allItems.sort((a, b) => b.computedScore - a.computedScore);
  console.log(`[feed] ${allItems.length} total items scored`);

  // Load dedup keys
  const cached = await db.select({ key: dedupCache.key }).from(dedupCache);
  const usedKeys = new Set(cached.map((r) => r.key));

  const stories: Story[] = [];
  for (const item of allItems) {
    if (!item.link || !item.title) continue;
    const key = item.link.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (usedKeys.has(key)) continue;
    stories.push({
      title: item.title,
      link: item.link,
      summary: item.contentSnippet || "",
      score: item.computedScore,
      imageUrl: item.imageUrl,
      publishedAt: item.pubDate,
      sourceName: item.feedName,
    });
    if (stories.length >= count) break;
  }

  console.log(`[feed] returning ${stories.length} stories`);
  return stories;
}

export async function getCandidateStories({
  count = 6,
  maxAgeHours = 48,
}: {
  count?: number;
  maxAgeHours?: number;
} = {}): Promise<Story[]> {
  console.log(`[feed] candidate pull from ${FEEDS.length} feeds`);

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const items = await fetchFeed(feed);
      return items.map((item) => ({
        ...item,
        feedWeight: feed.weight,
        feedName: feed.name,
        computedScore: scoreItem(item, feed.weight),
      }));
    })
  );

  const allItems: Array<FeedItem & { feedWeight: number; feedName: string; computedScore: number }> = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
    }
  }

  allItems.sort((a, b) => b.computedScore - a.computedScore);

  const cached = await db.select({ key: dedupCache.key }).from(dedupCache);
  const usedKeys = new Set(cached.map((row) => row.key));

  const stories: Story[] = [];
  for (const item of allItems) {
    if (!item.link || !item.title) continue;
    if (!isWithinWindow(item.pubDate, maxAgeHours)) continue;

    const key = item.link.replace(/^https?:\/\//, "").replace(/\/+$/, "");
    if (usedKeys.has(key)) continue;

    stories.push({
      title: item.title,
      link: item.link,
      summary: item.contentSnippet || "",
      score: item.computedScore,
      imageUrl: item.imageUrl,
      publishedAt: item.pubDate,
      sourceName: item.feedName,
    });

    if (stories.length >= count) break;
  }

  return stories;
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
