import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { platforms, posts } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import {
  getHomeTimelineFromInstalledSession,
  getHomeTimelineForPlatform,
  getLikeCount,
  getReplyCount,
  getRetweetCount,
  getTweetAuthor,
  getTweetCreatedAt,
  getTweetImageUrl,
  getTweetText,
  getTweetUrl,
  isReplyTweet,
  type BirdTweet,
} from "@/lib/replies/bird";

const RECENT_HOURS = 12;
const HOME_TIMELINE_COUNT = 50;
type XPlatformRow = typeof platforms.$inferSelect;

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json().catch(() => ({}));
    const requestedHandle = typeof body.handle === "string" ? body.handle.trim() : "";
    const rows = await db
      .select()
      .from(platforms)
      .where(
        and(
          eq(platforms.workspaceId, tenant.currentWorkspace.id),
          inArray(platforms.type, ["x", "twitter"])
        )
      );
    const birdPlatform = rows.find((platform) => platform.provider === "bird") ?? null;
    const platform = birdPlatform ?? rows[0] ?? null;
    const handle = cleanHandle(requestedHandle || platform?.handle || "maxpetrusenko");

    if (!handle) {
      return NextResponse.json({ error: "Add an X handle first." }, { status: 400 });
    }

    const tweets = await loadHomeTimeline(birdPlatform);
    const usedTweetIds = await loadUsedTweetIds(tenant.currentWorkspace.id);

    const candidates = tweets
      .filter((tweet) => !isReplyTweet(tweet))
      .filter((tweet) => !isOwnTweet(tweet, handle))
      .filter((tweet) => isRecentTweet(tweet, RECENT_HOURS))
      .filter((tweet) => {
        const tweetId = tweet.id || extractTweetId(getTweetUrl(tweet));
        return tweetId ? !usedTweetIds.has(tweetId) : true;
      })
      .map((tweet) => {
        const text = getTweetText(tweet).trim();
        const metrics = {
          likes: getLikeCount(tweet),
          replies: getReplyCount(tweet),
          reposts: getRetweetCount(tweet),
        };
        return {
          id: tweet.id ?? getTweetUrl(tweet),
          url: getTweetUrl(tweet),
          title: `@${getTweetAuthor(tweet)}`,
          text,
          content: text,
          imageUrl: getTweetImageUrl(tweet),
          createdAt: getTweetCreatedAt(tweet) ?? null,
          metrics,
          score: scoreTweet(metrics),
        };
      })
      .filter((candidate) => candidate.content.length > 0)
      .sort((left, right) => right.score - left.score);

    if (candidates.length === 0) {
      return NextResponse.json({ error: "No popular home timeline posts under 12 hours old found." }, { status: 404 });
    }

    return NextResponse.json({
      source: "x",
      handle,
      sourceUrl: candidates[0].url,
      ...candidates[0],
      candidates,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isAuthError(message)) {
      console.warn("[post-generation:x] X credentials unavailable.");
      return NextResponse.json(
        { error: "Reconnect X or log into x.com in a browser Bird can read, then try again." },
        { status: 401 }
      );
    }

    console.error("[post-generation:x] failed:", error);
    return NextResponse.json({ error: "Could not load recent X posts." }, { status: 500 });
  }
}

function cleanHandle(value: string) {
  return value.replace(/^@+/, "").trim();
}

async function loadHomeTimeline(birdPlatform: XPlatformRow | null) {
  if (!birdPlatform) {
    return getHomeTimelineFromInstalledSession(HOME_TIMELINE_COUNT, true);
  }

  try {
    return await getHomeTimelineForPlatform(birdPlatform, HOME_TIMELINE_COUNT, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAuthError(message)) throw error;
    console.warn("[post-generation:x] dashboard X cookies failed; falling back to installed Bird session.");
    return getHomeTimelineFromInstalledSession(HOME_TIMELINE_COUNT, true);
  }
}

function isAuthError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("could not authenticate") ||
    normalized.includes("missing required credentials") ||
    normalized.includes("missing auth_token") ||
    normalized.includes("missing ct0") ||
    normalized.includes("unauthorized") ||
    normalized.includes("forbidden") ||
    normalized.includes("code\":32");
}

function isOwnTweet(tweet: BirdTweet, handle: string) {
  return getTweetAuthor(tweet).replace(/^@+/, "").toLowerCase() === handle.toLowerCase();
}

function isRecentTweet(tweet: BirdTweet, maxHours: number) {
  const createdAt = getTweetCreatedAt(tweet);
  if (!createdAt) return false;

  const createdTime = new Date(createdAt).getTime();
  if (!Number.isFinite(createdTime)) return false;

  return Date.now() - createdTime <= maxHours * 60 * 60 * 1000;
}

function scoreTweet(metrics: { likes: number; replies: number; reposts: number }) {
  return metrics.likes + metrics.replies * 3 + metrics.reposts * 4;
}

async function loadUsedTweetIds(workspaceId: string) {
  const rows = await db
    .select({
      sourceUrl: posts.sourceUrl,
      content: posts.content,
      status: posts.status,
    })
    .from(posts)
    .where(eq(posts.workspaceId, workspaceId));

  const blockingStatuses = new Set(["scheduled", "publishing", "published", "partial_failure"]);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!blockingStatuses.has(row.status)) continue;
    for (const value of [row.sourceUrl, row.content]) {
      for (const id of extractTweetIds(value || "")) {
        ids.add(id);
      }
    }
  }

  return ids;
}

function extractTweetId(value: string) {
  return extractTweetIds(value)[0] ?? null;
}

function extractTweetIds(value: string) {
  return Array.from(value.matchAll(/(?:x\.com|twitter\.com)\/[^/\s]+\/status\/(\d+)/gi))
    .map((match) => match[1])
    .filter(Boolean);
}
