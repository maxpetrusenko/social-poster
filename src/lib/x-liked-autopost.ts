import crypto from "node:crypto";

import { db } from "@/db";
import { dedupCache, pipelineRuns, platforms, posts, postTargets, profiles, workspaces } from "@/db/schema";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import {
  resolvePostStatusFromTargetResults,
  resolvePublishResultsStatus,
} from "@/lib/pipeline/status";
import {
  getLikedTweetsForPlatform,
  getTweetAuthor,
  getTweetAuthorName,
  getTweetImageUrl,
  getTweetText,
  isReplyTweet,
  type BirdTweet,
} from "@/lib/replies/bird";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";
import { uploadMediaAsset } from "@/lib/storage/r2";
import {
  buildXLikedDedupKey,
  buildXLikedPostContent,
  buildXLikedSourceUrl,
  cleanXLikedText,
  pickXLikedMedia,
  type XLikedMedia,
} from "@/lib/x-liked-autopost-format";
import { and, desc, eq, inArray, or } from "drizzle-orm";

type PlatformRow = typeof platforms.$inferSelect;
type ProfileRow = typeof profiles.$inferSelect;

export type XLikedAutopostResult = {
  ok: boolean;
  workspaceId: string;
  dryRun: boolean;
  scanned: number;
  imported: number;
  skipped: Array<{ url: string; reason: string }>;
  posts: Array<{
    postId: string;
    sourceUrl: string;
    authorHandle: string;
    mediaUrl: string | null;
    targets: Array<{
      platform: string;
      success: boolean;
      postUrl?: string;
      error?: string;
    }>;
  }>;
};

type RunOptions = {
  workspaceId: string;
  limit?: number;
  fetchCount?: number;
  dryRun?: boolean;
};

function clampPositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, Math.floor(parsed));
}

function normalizeHandle(value?: string | null) {
  return value?.trim().replace(/^@/, "").toLowerCase() || "";
}

function isXPlatform(row: Pick<PlatformRow, "type">) {
  return ["x", "twitter"].includes(row.type.toLowerCase());
}

function isLinkedInPlatform(row: Pick<PlatformRow, "type">) {
  return row.type.toLowerCase() === "linkedin_personal";
}

function getMediaContentType(url: string, fallback: XLikedMedia["mediaType"]) {
  const pathname = (() => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  })();

  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".mp4")) return "video/mp4";
  if (pathname.endsWith(".mov")) return "video/quicktime";
  if (pathname.endsWith(".webm")) return "video/webm";
  return fallback === "video" ? "video/mp4" : "image/jpeg";
}

async function findWorkspace(workspaceId: string) {
  return db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
}

async function findDefaultProfile(workspaceId: string): Promise<ProfileRow | null> {
  const rows = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workspaceId, workspaceId))
    .orderBy(desc(profiles.isDefault), desc(profiles.createdAt));

  return rows[0] ?? null;
}

async function findTargetPlatforms(workspaceId: string) {
  const rows = await db
    .select()
    .from(platforms)
    .where(
      and(
        eq(platforms.workspaceId, workspaceId),
        eq(platforms.enabled, true),
        or(inArray(platforms.type, ["x", "twitter", "linkedin_personal"]))
      )
    )
    .orderBy(desc(platforms.createdAt));

  const xPlatform =
    rows.find((row) => row.provider === "bird" && isXPlatform(row)) ??
    rows.find((row) => isXPlatform(row)) ??
    null;
  const linkedinPlatform = rows.find((row) => isLinkedInPlatform(row)) ?? null;

  return {
    xPlatform,
    publishPlatforms: [xPlatform, linkedinPlatform].filter(
      (row): row is PlatformRow => Boolean(row)
    ),
  };
}

async function alreadyImported(workspaceId: string, sourceUrl: string, dedupKey: string) {
  const existingPosts = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        eq(posts.workspaceId, workspaceId),
        or(eq(posts.sourceUrl, sourceUrl), eq(posts.dedupKey, dedupKey))
      )
    );
  if (existingPosts.length > 0) return true;

  const existingKeys = await db
    .select({ id: dedupCache.id })
    .from(dedupCache)
    .where(eq(dedupCache.key, dedupKey));
  return existingKeys.length > 0;
}

async function snapshotMedia(
  workspaceId: string,
  tweetId: string | undefined,
  media: XLikedMedia | null
) {
  if (!media) return null;

  const response = await safeFetchRemote(media.url, {
    headers: {
      "User-Agent": "social-poster/1.0",
      Accept: media.mediaType === "video" ? "video/*,*/*;q=0.8" : "image/*,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);

  if (!response?.ok) return media.url;

  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || getMediaContentType(media.url, media.mediaType);
  const stored = await uploadMediaAsset({
    bytes,
    contentType,
    keyPrefix: `workspaces/${workspaceId}/posts/media/x-likes`,
    sourceName: tweetId || "liked-post",
  }).catch((error) => {
    console.warn("[x-liked-autopost] media snapshot failed:", error);
    return null;
  });

  return stored?.url ?? media.url;
}

function shouldSkipTweet(tweet: BirdTweet, xPlatform: PlatformRow) {
  const sourceUrl = buildXLikedSourceUrl(tweet);
  if (!tweet.id && !tweet.url) {
    return { url: sourceUrl, reason: "missing tweet id/url" };
  }

  if (isReplyTweet(tweet)) {
    return { url: sourceUrl, reason: "reply tweet" };
  }

  const sourceText = getTweetText(tweet);
  if (!sourceText.trim()) {
    return { url: sourceUrl, reason: "empty tweet text" };
  }

  const authorHandle = normalizeHandle(getTweetAuthor(tweet));
  const ownHandle = normalizeHandle(xPlatform.handle);
  if (authorHandle && ownHandle && authorHandle === ownHandle) {
    return { url: sourceUrl, reason: "own tweet" };
  }

  return null;
}

async function markDedupKey(dedupKey: string, source: string) {
  try {
    await db.insert(dedupCache).values({
      id: crypto.randomUUID(),
      key: dedupKey,
      source: source.slice(0, 200),
      createdAt: new Date(),
    });
  } catch {
    // Duplicate key is the desired idempotent outcome.
  }
}

export async function runXLikedAutopost(options: RunOptions): Promise<XLikedAutopostResult> {
  const limit = clampPositiveInteger(options.limit, 3, 10);
  const fetchCount = clampPositiveInteger(options.fetchCount, Math.max(limit * 3, 10), 50);
  const dryRun = options.dryRun === true;
  const workspace = await findWorkspace(options.workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${options.workspaceId}`);
  }

  const profile = await findDefaultProfile(options.workspaceId);
  const { xPlatform, publishPlatforms } = await findTargetPlatforms(options.workspaceId);
  if (!xPlatform) {
    throw new Error("No enabled X/Bird platform found for this workspace.");
  }

  if (publishPlatforms.length === 0) {
    throw new Error("No enabled publish platforms found for this workspace.");
  }

  const likedTweets = await getLikedTweetsForPlatform(xPlatform, fetchCount, true);
  const result: XLikedAutopostResult = {
    ok: true,
    workspaceId: options.workspaceId,
    dryRun,
    scanned: likedTweets.length,
    imported: 0,
    skipped: [],
    posts: [],
  };

  for (const tweet of likedTweets) {
    if (result.imported >= limit) break;

    const skip = shouldSkipTweet(tweet, xPlatform);
    if (skip) {
      result.skipped.push(skip);
      continue;
    }

    const sourceUrl = buildXLikedSourceUrl(tweet);
    const dedupKey = buildXLikedDedupKey(tweet);
    if (await alreadyImported(options.workspaceId, sourceUrl, dedupKey)) {
      result.skipped.push({ url: sourceUrl, reason: "already imported" });
      continue;
    }

    const authorHandle = getTweetAuthor(tweet);
    const fallbackImage = getTweetImageUrl(tweet);
    const media = pickXLikedMedia(tweet, fallbackImage);
    const cleanText = cleanXLikedText(getTweetText(tweet), { hasMedia: Boolean(media) });
    const content = buildXLikedPostContent({
      authorHandle,
      sourceUrl,
      sourceText: cleanText,
    });

    if (dryRun) {
      result.imported += 1;
      result.posts.push({
        postId: "dry-run",
        sourceUrl,
        authorHandle,
        mediaUrl: media?.url ?? null,
        targets: publishPlatforms.map((platform) => ({
          platform: platform.type,
          success: true,
        })),
      });
      continue;
    }

    const now = new Date();
    const runId = crypto.randomUUID();
    const postId = crypto.randomUUID();
    const mediaUrl = await snapshotMedia(options.workspaceId, tweet.id, media);
    const publishTargets = publishPlatforms.map((platform) => ({
      platform,
      content,
      mediaUrl: mediaUrl ?? undefined,
      mediaType: media?.mediaType,
    }));

    await db.insert(pipelineRuns).values({
      id: runId,
      workspaceId: options.workspaceId,
      trigger: "api",
      status: "running",
      steps: [
        {
          name: "x-like:ingest",
          status: "completed",
          startedAt: now.toISOString(),
          completedAt: now.toISOString(),
          output: { sourceUrl, authorHandle, mediaUrl },
        },
        { name: "publish", status: "running", startedAt: now.toISOString() },
      ],
      startedAt: now,
    });

    await db.insert(posts).values({
      id: postId,
      workspaceId: options.workspaceId,
      profileId: profile?.id ?? null,
      title: `Liked X post by @${normalizeHandle(authorHandle) || authorHandle}`,
      content,
      contentType: media?.mediaType ?? "text",
      mediaUrl,
      sourceUrl,
      sourceTitle: getTweetAuthorName(tweet),
      status: "publishing",
      dedupKey,
      metadata: {
        source: "x-liked-autopost",
        runId,
        tweetId: tweet.id ?? null,
        authorHandle,
      },
      createdAt: now,
      updatedAt: now,
    });

    const summary = await publishPlatformTargets(publishTargets);
    const postStatus = resolvePostStatusFromTargetResults(summary.outcomes);
    const completedAt = new Date();

    for (const target of publishTargets) {
      const outcome = summary.outcomes.find((item) => item.platform === target.platform.type);
      await db.insert(postTargets).values({
        id: crypto.randomUUID(),
        postId,
        platformId: target.platform.id,
        status: outcome?.success
          ? "published"
          : outcome?.classification === "disabled" || outcome?.classification === "duplicate"
            ? "skipped"
            : "failed",
        publishedUrl: outcome?.postUrl ?? null,
        platformPostId: outcome?.postId ?? null,
        error:
          outcome?.classification === "disabled"
            ? null
            : outcome?.error ?? null,
        publishedAt: outcome?.success ? completedAt : null,
        createdAt: completedAt,
      });
    }

    await db.update(posts).set({
      status: postStatus,
      publishedAt:
        postStatus === "published" || postStatus === "partial_failure"
          ? completedAt
          : null,
      updatedAt: completedAt,
    }).where(eq(posts.id, postId));

    await db.update(pipelineRuns).set({
      status: resolvePublishResultsStatus(summary.outcomes),
      postId,
      steps: [
        {
          name: "x-like:ingest",
          status: "completed",
          startedAt: now.toISOString(),
          completedAt: now.toISOString(),
          output: { sourceUrl, authorHandle, mediaUrl },
        },
        {
          name: "publish",
          status: summary.errors.length > 0 ? "failed" : "completed",
          startedAt: now.toISOString(),
          completedAt: completedAt.toISOString(),
          output: summary,
          error: summary.errors.map((error) => `${error.platform}: ${error.error}`).join("; ") || undefined,
        },
      ],
      error: summary.errors.map((error) => `${error.platform}: ${error.error}`).join("; ") || null,
      durationMs: Math.max(0, completedAt.getTime() - now.getTime()),
      completedAt,
    }).where(eq(pipelineRuns.id, runId));

    if (summary.outcomes.some((outcome) => outcome.success)) {
      await markDedupKey(dedupKey, sourceUrl);
    }

    result.imported += 1;
    result.posts.push({
      postId,
      sourceUrl,
      authorHandle,
      mediaUrl,
      targets: summary.outcomes.map((outcome) => ({
        platform: outcome.platform,
        success: outcome.success,
        postUrl: outcome.postUrl,
        error: outcome.error,
      })),
    });
  }

  return result;
}
