import crypto from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { platforms, replyCandidates, replyEvents } from "@/db/schema";
import {
  getLikeCount,
  getTweetAuthor,
  getTweetAuthorName,
  getTweetCreatedAt,
  getTweetImageUrl,
  getTweetText,
  getTweetUrl,
  getViewCount,
  isReplyTweet,
  searchTweetsForPlatform,
} from "@/lib/replies/bird";
import { generateAiReplyDraftsBatch } from "@/lib/replies/ai";
import type { ReplyCard } from "@/components/dashboard/replies-mock-data";

type PlatformRow = typeof platforms.$inferSelect;
type CandidateRow = typeof replyCandidates.$inferSelect;

const DISCOVERY_QUERIES = [
  "chatbot",
  "ai assistant",
  "support bot",
  "voice agent",
  "customer service ai",
  "real estate bot",
  "personalized assistant",
  "memory for chatbots",
];

type PopularReply = {
  author: string;
  handle: string;
  text: string;
  likes: number;
};

type LiveCandidate = {
  tweetId: string;
  tweetUrl: string;
  authorHandle: string;
  authorName: string;
  tweetText: string;
  hook: string;
  score: number;
  riskLevel: "low" | "medium";
  repliesScraped: number;
  tags: string[];
  popularReplies: PopularReply[];
  drafts: string[];
  postedAtLabel: string;
  metadata: {
    query: string;
    sourceType: "original_post";
    engagement: {
      likes: number;
      views: string;
    };
    mediaUrl: string | null;
  };
};

export async function listReplyCandidates(platformId?: string): Promise<ReplyCard[]> {
  const rows = platformId
    ? await db
        .select()
        .from(replyCandidates)
        .where(eq(replyCandidates.platformId, platformId))
        .orderBy(desc(replyCandidates.updatedAt))
    : await db.select().from(replyCandidates).orderBy(desc(replyCandidates.updatedAt));

  return rows
    .filter((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      return metadata.sourceType === "original_post";
    })
    .map(mapRowToCard);
}

export async function refreshReplyCandidates(platformId: string) {
  const platform = await db.query.platforms.findFirst({
    where: eq(platforms.id, platformId),
  });

  if (!platform) {
    throw new Error("X connection not found");
  }

  if (!["twitter", "x"].includes(platform.type)) {
    throw new Error("Reply discovery requires an X connection");
  }

  const discovered = await discoverLiveCandidates(platform);
  const aiDrafts = await generateAiReplyDraftsBatch(
    discovered.map((item) => ({
      tweetId: item.tweetId,
      author: item.authorHandle,
      text: item.tweetText,
      tags: item.tags,
      likes: item.metadata.engagement.likes,
      views: item.metadata.engagement.views,
      contextLabel: item.metadata.query,
    }))
  );

  const drafted = discovered.flatMap((item) => {
    const drafts = aiDrafts.get(item.tweetId) ?? [];
    return drafts.length > 0 ? [{ ...item, drafts }] : [];
  });

  await db
    .delete(replyCandidates)
    .where(and(eq(replyCandidates.platformId, platform.id), ne(replyCandidates.status, "posted")));

  for (const item of drafted) {
    const now = new Date();
    await db.insert(replyCandidates).values({
      id: crypto.randomUUID(),
      platformId: platform.id,
      tweetId: item.tweetId,
      tweetUrl: item.tweetUrl,
      replyUrl: null,
      authorHandle: item.authorHandle,
      authorName: item.authorName,
      tweetText: item.tweetText,
      hook: item.hook,
      status: "drafted",
      riskLevel: item.riskLevel,
      score: item.score,
      repliesScraped: item.repliesScraped,
      tags: item.tags,
      popularReplies: item.popularReplies,
      drafts: item.drafts,
      selectedDraftIndex: 0,
      postedAtLabel: item.postedAtLabel,
      metadata: item.metadata,
      error: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  return listReplyCandidates(platformId);
}

export async function updateReplyCandidateStatus(
  candidateId: string,
  status: CandidateRow["status"],
  selectedDraftIndex?: number
) {
  const now = new Date();
  const update: Partial<typeof replyCandidates.$inferInsert> = {
    status,
    updatedAt: now,
  };

  if (typeof selectedDraftIndex === "number" && Number.isFinite(selectedDraftIndex)) {
    update.selectedDraftIndex = selectedDraftIndex;
  }

  await db.update(replyCandidates).set(update).where(eq(replyCandidates.id, candidateId));
  return db.query.replyCandidates.findFirst({ where: eq(replyCandidates.id, candidateId) });
}

export async function updateReplyCandidateDraft(
  candidateId: string,
  index: number,
  text: string
) {
  const row = await db.query.replyCandidates.findFirst({
    where: eq(replyCandidates.id, candidateId),
  });

  if (!row) {
    throw new Error("Reply candidate not found");
  }

  const drafts = Array.isArray(row.drafts) ? [...row.drafts] : [];
  if (!drafts[index]) {
    throw new Error("Draft not found");
  }

  drafts[index] = text.trim();
  await db
    .update(replyCandidates)
    .set({
      drafts,
      updatedAt: new Date(),
    })
    .where(eq(replyCandidates.id, candidateId));

  return db.query.replyCandidates.findFirst({ where: eq(replyCandidates.id, candidateId) });
}

export async function postReplyCandidate(candidateId: string) {
  const row = await db.query.replyCandidates.findFirst({
    where: eq(replyCandidates.id, candidateId),
  });

  if (!row) {
    throw new Error("Reply candidate not found");
  }

  const platform = row.platformId
    ? await db.query.platforms.findFirst({ where: eq(platforms.id, row.platformId) })
    : null;

  if (!platform) {
    throw new Error("X connection missing for this reply");
  }

  const drafts = Array.isArray(row.drafts) ? row.drafts : [];
  const draft = drafts[row.selectedDraftIndex || 0];
  if (!draft) {
    throw new Error("No approved draft selected");
  }

  const { sendReplyViaPlatform } = await import("@/lib/replies/transport");
  const { replyUrl } = await sendReplyViaPlatform(platform, row.tweetUrl, draft);

  await db.update(replyCandidates).set({
    status: "posted",
    replyUrl,
    updatedAt: new Date(),
    error: null,
  }).where(eq(replyCandidates.id, candidateId));

  await db.insert(replyEvents).values({
    id: crypto.randomUUID(),
    runId: null,
    scheduleId: null,
    platformId: platform.id,
    tweetUrl: row.tweetUrl,
    replyUrl,
    authorHandle: row.authorHandle,
    category: "live_queue",
    lane: "operator_queue",
    replyText: draft,
    status: "sent",
    metadata: {
      score: row.score,
      riskLevel: row.riskLevel,
    },
    createdAt: new Date(),
  });

  return db.query.replyCandidates.findFirst({ where: eq(replyCandidates.id, candidateId) });
}

async function discoverLiveCandidates(platform: PlatformRow) {
  const alreadyRepliedRows = await db
    .select({ tweetUrl: replyEvents.tweetUrl })
    .from(replyEvents)
    .where(eq(replyEvents.status, "sent"));
  const alreadyReplied = new Set(alreadyRepliedRows.map((row) => row.tweetUrl));

  const found = new Map<string, LiveCandidate>();

  for (const query of DISCOVERY_QUERIES) {
    const tweets = await searchTweetsForPlatform(platform, query, 4);

    for (const tweet of tweets) {
      const tweetUrl = getTweetUrl(tweet);
      if (!tweet.id || !getTweetText(tweet).trim()) continue;
      if (isReplyTweet(tweet)) continue;
      if (!isFreshEnough(getTweetCreatedAt(tweet))) continue;
      if (alreadyReplied.has(tweetUrl)) continue;

      const candidate = await buildLiveCandidate(platform, tweet, query);
      if (!candidate) continue;

      found.set(tweetUrl, candidate);
      if (found.size >= 9) break;
    }

    if (found.size >= 9) break;
  }

  return Array.from(found.values()).sort((left, right) => right.score - left.score);
}

async function buildLiveCandidate(
  _platform: PlatformRow,
  tweet: {
    id?: string;
    url?: string;
    text?: string;
    createdAt?: string;
    created_at?: string;
    author?: { username?: string; name?: string; followersCount?: number };
    authorId?: string;
    replyCount?: number;
    retweetCount?: number;
    public_metrics?: { reply_count?: number; retweet_count?: number; like_count?: number; impression_count?: number };
    _raw?: Record<string, unknown>;
  },
  query: string
): Promise<LiveCandidate | null> {
  const tweetUrl = getTweetUrl(tweet);
  const rootTweet = tweet;
  const replies: PopularReply[] = [];

  const tweetText = getTweetText(rootTweet).trim();
  if (!tweetText) return null;

  const score = calculateScore(rootTweet, query, replies.length);
  const riskLevel = score >= 82 ? "medium" : "low";
  return {
    tweetId: rootTweet.id || tweet.id || crypto.randomUUID(),
    tweetUrl,
    authorHandle: getTweetAuthor(rootTweet),
    authorName: getTweetAuthorName(rootTweet),
    tweetText,
    hook: extractHook(tweetText),
    score,
    riskLevel,
    repliesScraped: replies.length,
    tags: buildTags(query, tweetText),
    popularReplies: replies,
    drafts: [],
    postedAtLabel: formatPostedLabel(getTweetCreatedAt(rootTweet)),
    metadata: {
      query,
      sourceType: "original_post",
      engagement: {
        likes: getLikeCount(rootTweet),
        views: compactNumber(getViewCount(rootTweet)),
      },
      mediaUrl: getTweetImageUrl(rootTweet),
    },
  };
}

function calculateScore(
  tweet: {
    author?: { followersCount?: number };
    text?: string;
    public_metrics?: { like_count?: number };
  },
  query: string,
  replyContextCount: number
) {
  let score = 58;
  const text = (tweet.text || "").toLowerCase();

  if (text.includes("chatbot") || text.includes("assistant") || text.includes("agent")) score += 10;
  if (text.includes("memory") || text.includes("personalization") || text.includes("support")) score += 8;
  if (query.includes("real estate") && text.includes("real estate")) score += 10;
  if ((tweet.author?.followersCount || 0) > 25000) score += 4;
  if ((tweet.public_metrics?.like_count || 0) > 20) score += 6;
  if (replyContextCount >= 2) score += 6;

  return Math.min(score, 92);
}

function buildTags(query: string, text: string) {
  const tags = new Set<string>();
  const lowered = `${query} ${text}`.toLowerCase();
  if (lowered.includes("chatbot")) tags.add("chatbot");
  if (lowered.includes("assistant")) tags.add("assistant");
  if (lowered.includes("support")) tags.add("support bot");
  if (lowered.includes("voice")) tags.add("voice agent");
  if (lowered.includes("memory")) tags.add("memory");
  if (lowered.includes("real estate")) tags.add("real estate");
  return Array.from(tags).slice(0, 3);
}

function extractHook(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences[1] || sentences[0] || text;
}

function formatPostedLabel(createdAt?: string) {
  if (!createdAt) return "today";
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "today";
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  });
}

function isFreshEnough(createdAt?: string) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= 1000 * 60 * 60 * 36;
}

function compactNumber(value: number) {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function mapRowToCard(row: CandidateRow): ReplyCard {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const engagement =
    metadata.engagement && typeof metadata.engagement === "object"
      ? (metadata.engagement as Record<string, unknown>)
      : {};
  const mediaUrl = typeof metadata.mediaUrl === "string" ? metadata.mediaUrl : null;

  return {
    id: row.id,
    profileName: row.authorName || row.authorHandle,
    author: row.authorHandle.startsWith("@") ? row.authorHandle : `@${row.authorHandle}`,
    tweetUrl: row.tweetUrl,
    replyUrl: row.replyUrl || row.tweetUrl,
    mediaUrl,
    status: normalizeStatus(row.status),
    title: row.tweetText,
    hook: row.hook || row.tweetText,
    score: row.score,
    risk: row.riskLevel === "medium" ? "medium" : "low",
    repliesScraped: row.repliesScraped,
    updatedLabel: relativeMinutes(row.updatedAt),
    tags: Array.isArray(row.tags) ? row.tags : [],
    bestAngle: "Operator draft",
    why: "Live candidate discovered from X search.",
    shouldMentionProduct: "soft",
    postedAt: row.postedAtLabel || "today",
    engagement: {
      replies: getReplyCountFromRow(row),
      likes: typeof engagement.likes === "number" ? engagement.likes : 0,
      views: typeof engagement.views === "string" ? engagement.views : "0",
    },
    thread: [row.tweetText],
    popularReplies: Array.isArray(row.popularReplies) ? row.popularReplies : [],
    drafts: Array.isArray(row.drafts) ? row.drafts : [],
  };
}

function normalizeStatus(status: string) {
  if (status === "new" || status === "analyzed" || status === "drafted" || status === "ready" || status === "posted") {
    return status;
  }
  return "drafted";
}

function relativeMinutes(date: Date | null) {
  if (!date) return "just now";
  const diff = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diff < 60) return `${diff}m ago`;
  const hours = Math.round(diff / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function getReplyCountFromRow(row: CandidateRow) {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const engagement =
    metadata.engagement && typeof metadata.engagement === "object"
      ? (metadata.engagement as Record<string, unknown>)
      : {};

  return typeof engagement.replies === "number" ? engagement.replies : 0;
}
