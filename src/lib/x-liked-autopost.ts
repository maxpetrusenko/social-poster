import crypto from "node:crypto";

import { db } from "@/db";
import { dedupCache, pipelineRuns, platforms, posts, postTargets, profiles, schedules, workspaces, type PipelineStep } from "@/db/schema";
import { fetchOpenGraphImage } from "@/lib/open-graph-image";
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
  draftXLikedAutopostContent,
  XLikedAutopostWriterError,
  type XLikedAutopostWriterResult,
} from "@/lib/x-liked-autopost-writer";
import {
  buildXLikedDedupKey,
  buildXLikedPlatformPostContent,
  getXLikedExternalUrls,
  buildXLikedPostContent,
  buildXLikedSourceUrl,
  cleanXLikedText,
  getXLikedAutopostSkipReason,
  pickXLikedMedia,
  resolveXLikedPlatformMedia,
  type XLikedMedia,
} from "@/lib/x-liked-autopost-format";
import type { XLikedAutopostOperationalFailure } from "@/lib/x-liked-autopost-notifications";
import {
  findNextXLikedAutopostSlot,
  getXLikedRecurringScheduleSlots,
  validateXLikedPublishTargets,
} from "@/lib/x-liked-autopost-queue";
import { and, asc, desc, eq, gte, inArray, or } from "drizzle-orm";

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
    content?: string;
    mediaUrl: string | null;
    mediaSourceUrl?: string | null;
    scheduledAt?: string;
    targets: Array<{
      platform: string;
      success: boolean;
      content?: string;
      postUrl?: string;
      error?: string;
    }>;
  }>;
};

export type XLikedAutopostReviewCandidate = {
  id: string | null;
  sourceUrl: string;
  authorHandle: string;
  authorName: string;
  sourceText: string;
  content: string;
  mediaUrl: string | null;
  mediaType: XLikedMedia["mediaType"] | null;
  status: "eligible" | "skipped";
  reason: string | null;
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

function completedStep(
  name: string,
  at: Date,
  output?: unknown,
  error?: string
): PipelineStep {
  return {
    name,
    status: error ? "failed" : "completed",
    startedAt: at.toISOString(),
    completedAt: at.toISOString(),
    output,
    error,
  };
}

function runningStep(name: string, at: Date, output?: unknown): PipelineStep {
  return {
    name,
    status: "running",
    startedAt: at.toISOString(),
    output,
  };
}

function getDashboardRunUrl(runId: string) {
  const base = (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://smmagent.app"
  ).replace(/\/+$/, "");
  return `${base}/dashboard/pipeline?runId=${encodeURIComponent(runId)}`;
}

function buildWriterOperationalFailure(input: {
  error: XLikedAutopostWriterError;
}): XLikedAutopostOperationalFailure {
  return {
    platform: "writer",
    classification:
      input.error.code === "quality_rejected"
        ? "writer_quality_rejected"
        : "writer_unavailable",
    error: input.error.message,
  };
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

async function findExistingXLikedQueuedSlots(workspaceId: string, now: Date) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [queuedRows, recurringSchedules] = await Promise.all([
    db
      .select({ scheduledAt: posts.scheduledAt })
      .from(posts)
      .where(
        and(
          eq(posts.workspaceId, workspaceId),
          inArray(posts.status, ["scheduled", "publishing"]),
          gte(posts.scheduledAt, since)
        )
      )
      .orderBy(asc(posts.scheduledAt)),
    db
      .select({
        cron: schedules.cron,
        enabled: schedules.enabled,
        jobType: schedules.jobType,
      })
      .from(schedules)
      .where(and(eq(schedules.workspaceId, workspaceId), eq(schedules.enabled, true))),
  ]);

  const queuedSlots = queuedRows
    .map((row) => row.scheduledAt)
    .filter((date): date is Date => date instanceof Date);
  const recurringSlots = getXLikedRecurringScheduleSlots({
    schedules: recurringSchedules,
    now,
  });

  return [...queuedSlots, ...recurringSlots];
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

async function resolveExternalPreviewMedia(tweet: BirdTweet, sourceText: string): Promise<XLikedMedia | null> {
  for (const url of getXLikedExternalUrls({ tweet, sourceText }).slice(0, 3)) {
    const imageUrl = await fetchOpenGraphImage(url);
    if (imageUrl) {
      return { url: imageUrl, mediaType: "image" };
    }
  }

  return null;
}

async function resolveXLikedMedia(tweet: BirdTweet, fallbackImage: string | null) {
  const directMedia = pickXLikedMedia(tweet, fallbackImage);
  if (directMedia) return directMedia;
  return resolveExternalPreviewMedia(tweet, getTweetText(tweet));
}

function shouldSkipTweet(tweet: BirdTweet, xPlatform: PlatformRow, hasMedia = false) {
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

  const unsafeReason = getXLikedAutopostSkipReason({
    sourceText,
    hasMedia,
  });
  if (unsafeReason) {
    return { url: sourceUrl, reason: unsafeReason };
  }

  return null;
}

function isDuplicateDedupKeyError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("UNIQUE constraint failed") ||
    error.message.includes("SQLITE_CONSTRAINT")
  );
}

async function claimDedupKey(dedupKey: string, source: string) {
  try {
    await db.insert(dedupCache).values({
      id: crypto.randomUUID(),
      key: dedupKey,
      source: source.slice(0, 200),
      createdAt: new Date(),
    });
    return true;
  } catch (error) {
    if (isDuplicateDedupKeyError(error)) return false;
    throw error;
  }
}

async function releaseDedupKey(dedupKey: string) {
  try {
    await db.delete(dedupCache).where(eq(dedupCache.key, dedupKey));
  } catch {
    // A failed release should not hide the original pipeline failure.
  }
}

export async function getXLikedAutopostReviewCandidates(options: {
  workspaceId: string;
  fetchCount?: number;
}): Promise<XLikedAutopostReviewCandidate[]> {
  const fetchCount = clampPositiveInteger(options.fetchCount, 25, 50);
  const workspace = await findWorkspace(options.workspaceId);
  if (!workspace) {
    throw new Error(`Workspace not found: ${options.workspaceId}`);
  }

  const { xPlatform } = await findTargetPlatforms(options.workspaceId);
  if (!xPlatform) {
    throw new Error("No enabled X/Bird platform found for this workspace.");
  }

  const likedTweets = await getLikedTweetsForPlatform(xPlatform, fetchCount, true);
  const candidates: XLikedAutopostReviewCandidate[] = [];

  for (const tweet of likedTweets) {
    const sourceUrl = buildXLikedSourceUrl(tweet);
    const dedupKey = buildXLikedDedupKey(tweet);
    const authorHandle = getTweetAuthor(tweet);
    const fallbackImage = getTweetImageUrl(tweet);
    const media = await resolveXLikedMedia(tweet, fallbackImage);
    const sourceText = cleanXLikedText(getTweetText(tweet), { hasMedia: Boolean(media) });
    const policySkip = shouldSkipTweet(tweet, xPlatform, Boolean(media));
    const imported = await alreadyImported(options.workspaceId, sourceUrl, dedupKey);
    const reason = imported ? "already imported or blocked" : policySkip?.reason ?? null;

    candidates.push({
      id: tweet.id ?? null,
      sourceUrl,
      authorHandle,
      authorName: getTweetAuthorName(tweet),
      sourceText,
      content: buildXLikedPostContent({
        authorHandle,
        sourceUrl,
        sourceText,
      }),
      mediaUrl: media?.url ?? null,
      mediaType: media?.mediaType ?? null,
      status: reason ? "skipped" : "eligible",
      reason,
    });
  }

  return candidates;
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
  const queuedSlots = dryRun
    ? []
    : await findExistingXLikedQueuedSlots(options.workspaceId, new Date());
  const queueTimeZone = workspace.timezone || "America/New_York";

  for (const tweet of likedTweets) {
    if (result.imported >= limit) break;

    const fallbackImage = getTweetImageUrl(tweet);
    const media = await resolveXLikedMedia(tweet, fallbackImage);
    const skip = shouldSkipTweet(tweet, xPlatform, Boolean(media));
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
    const cleanText = cleanXLikedText(getTweetText(tweet), { hasMedia: Boolean(media) });
    const externalUrls = getXLikedExternalUrls({ tweet, sourceText: cleanText });
    if (!cleanText.trim()) {
      result.skipped.push({ url: sourceUrl, reason: "empty cleaned tweet text" });
      continue;
    }

    if (!dryRun && !(await claimDedupKey(dedupKey, sourceUrl))) {
      result.skipped.push({ url: sourceUrl, reason: "already imported" });
      continue;
    }

    const now = new Date();
    const runId = crypto.randomUUID();
    const runSteps: PipelineStep[] = [
      completedStep("x-like:source-captured", now, {
        sourceUrl,
        authorHandle,
        tweetId: tweet.id ?? null,
        mediaUrl: media?.url ?? null,
        externalUrls,
      }),
      completedStep("x-like:gbrain-context", now, {
        status: "deferred",
        note: "Persisting taste/eval evidence in pipeline run until gbrain adapter is wired.",
      }),
      completedStep("x-like:source-verified", now, {
        status: "captured",
        sourceUrl,
        authorHandle,
        hasText: Boolean(cleanText.trim()),
        hasMedia: Boolean(media),
      }),
    ];

    if (!dryRun) {
      await db.insert(pipelineRuns).values({
        id: runId,
        workspaceId: options.workspaceId,
        trigger: "api",
        status: "running",
        steps: [...runSteps, runningStep("x-like:draft", now)],
        startedAt: now,
      });
    }

    let writer: XLikedAutopostWriterResult;
    try {
      writer = await draftXLikedAutopostContent({
        workspaceId: options.workspaceId,
        authorHandle,
        sourceUrl,
        sourceText: cleanText,
        externalUrls,
        hasMedia: Boolean(media),
        mediaType: media?.mediaType ?? null,
        mediaSourceUrl: media?.sourceUrl ?? null,
      });
      runSteps.push(
        completedStep("x-like:draft", new Date(), {
          strategy: "ai",
          model: writer.model,
          modelSource: writer.modelSource,
          traceUrl: writer.traceUrl,
        }),
        completedStep("x-like:reviewer", new Date(), {
          status: "passed",
          model: writer.review.model,
          modelSource: writer.review.modelSource,
          traceUrl: writer.review.traceUrl,
          rubric: [
            "source_fidelity",
            "factual_support",
            "max_voice",
            "banned_patterns",
            "platform_fit",
          ],
        })
      );
    } catch (error) {
      const writerError =
        error instanceof Error ? error.message : String(error);
      const writerFailure: XLikedAutopostOperationalFailure =
        error instanceof XLikedAutopostWriterError
          ? buildWriterOperationalFailure({ error })
          : {
              platform: "writer",
              classification: "writer_unavailable",
              error: writerError,
            };
      const completedAt = new Date();
      const failedSteps = [
        ...runSteps,
        completedStep("x-like:draft", completedAt, {
          strategy: "ai",
          status: "rejected_or_unavailable",
          error: writerError,
        }),
        completedStep("x-like:reviewer", completedAt, {
          status: "failed",
          failures: [writerFailure],
          note: "Writer and reviewer loop failed. No deterministic fallback was queued.",
        }, writerError),
      ];

      if (!dryRun) {
        await releaseDedupKey(dedupKey);
        await db.update(pipelineRuns).set({
          status: "failed",
          steps: failedSteps,
          error: writerError,
          durationMs: Math.max(0, completedAt.getTime() - now.getTime()),
          completedAt,
        }).where(eq(pipelineRuns.id, runId));
      }

      result.skipped.push({ url: sourceUrl, reason: `writer/reviewer failed: ${writerError}` });
      continue;
    }

    const content = writer.content;
    const mediaUrl = dryRun
      ? media?.url ?? null
      : await snapshotMedia(options.workspaceId, tweet.id, media);
    const publishTargets = publishPlatforms.map((platform) => ({
      platform,
      content: buildXLikedPlatformPostContent({
        baseContent: content,
        platformType: platform.type,
        media,
        sourceUrl,
        authorHandle,
      }),
      mediaUrl:
        resolveXLikedPlatformMedia(platform.type, media) && mediaUrl
          ? mediaUrl
          : undefined,
      mediaType: resolveXLikedPlatformMedia(platform.type, media)?.mediaType,
      threadLongPosts: false,
    }));
    const validationFailures = validateXLikedPublishTargets(publishTargets);

    runSteps.push(
      completedStep("x-like:packet-ready", new Date(), {
        contentLength: content.length,
        mediaUrl,
        mediaSourceUrl: media?.sourceUrl ?? null,
        targets: publishTargets.map((target) => ({
          platform: target.platform.type,
          contentLength: target.content.length,
          mediaType: target.mediaType ?? null,
        })),
      })
    );

    if (validationFailures.length > 0) {
      const error = validationFailures
        .map((failure) => `${failure.platform}: ${failure.reason}`)
        .join("; ");
      const completedAt = new Date();

      if (!dryRun) {
        await releaseDedupKey(dedupKey);
        await db.update(pipelineRuns).set({
          status: "failed",
          steps: [
            ...runSteps,
            completedStep("x-like:validate-packet", completedAt, {
              failures: validationFailures,
            }, error),
          ],
          error,
          durationMs: Math.max(0, completedAt.getTime() - now.getTime()),
          completedAt,
        }).where(eq(pipelineRuns.id, runId));
      }

      result.skipped.push({ url: sourceUrl, reason: error });
      continue;
    }

    const scheduledAt = findNextXLikedAutopostSlot({
      now,
      existingSlots: queuedSlots,
      timeZone: queueTimeZone,
    });
    queuedSlots.push(scheduledAt);

    if (dryRun) {
      result.imported += 1;
      result.posts.push({
        postId: "dry-run",
        sourceUrl,
        authorHandle,
        content,
        mediaUrl,
        mediaSourceUrl: media?.sourceUrl ?? null,
        scheduledAt: scheduledAt.toISOString(),
        targets: publishTargets.map((target) => ({
          platform: target.platform.type,
          success: true,
          content: target.content,
        })),
      });
      continue;
    }

    const postId = crypto.randomUUID();
    const platformOverrides = Object.fromEntries(
      publishTargets.map((target) => [
        target.platform.id,
        { caption: target.content },
      ])
    );
    const mediaUrlsByPlatformId = Object.fromEntries(
      publishTargets
        .filter((target) => target.mediaUrl)
        .map((target) => [target.platform.id, [target.mediaUrl]])
    );

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
      status: "scheduled",
      scheduledAt,
      dedupKey,
      metadata: {
        source: "x-liked-autopost",
        runId,
        dashboardUrl: getDashboardRunUrl(runId),
        tweetId: tweet.id ?? null,
        authorHandle,
        platformOverrides,
        mediaUrlsByPlatformId,
        contentMachine: {
          invariant: "like_creates_publishing_obligation",
          fallbackAllowed: false,
          lowQualityAction: "repair_or_fail_closed",
        },
        writer: {
          source: "ai",
          model: writer.model,
          modelSource: writer.modelSource,
          traceUrl: writer.traceUrl,
          reviewer: {
            model: writer.review.model,
            modelSource: writer.review.modelSource,
            traceUrl: writer.review.traceUrl,
          },
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    const completedAt = new Date();

    for (const target of publishTargets) {
      await db.insert(postTargets).values({
        id: crypto.randomUUID(),
        postId,
        platformId: target.platform.id,
        status: "pending",
        publishedUrl: null,
        platformPostId: null,
        error: null,
        publishedAt: null,
        createdAt: completedAt,
      });
    }

    await db.update(pipelineRuns).set({
      status: "completed",
      postId,
      steps: [
        ...runSteps,
        completedStep("x-like:queued", completedAt, {
          scheduledAt: scheduledAt.toISOString(),
          timeZone: queueTimeZone,
          targets: publishTargets.map((target) => target.platform.type),
        }),
        completedStep("x-like:gbrain-learning", completedAt, {
          status: "ready",
          note: "Run evidence is persisted for gbrain ingestion: source, AI draft, queue slot, and publish targets.",
        }),
      ],
      error: null,
      durationMs: Math.max(0, completedAt.getTime() - now.getTime()),
      completedAt,
    }).where(eq(pipelineRuns.id, runId));
    result.imported += 1;
    result.posts.push({
      postId,
      sourceUrl,
      authorHandle,
      mediaUrl,
      scheduledAt: scheduledAt.toISOString(),
      targets: publishTargets.map((target) => ({
        platform: target.platform.type,
        success: true,
      })),
    });
  }

  return result;
}
