import crypto from "node:crypto";

import { db } from "@/db";
import { dedupCache, pipelineRuns, platforms, posts, postTargets, profiles, workspaces, type PipelineStep } from "@/db/schema";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import type { PublishResult } from "@/lib/pipeline/publisher";
import { fetchOpenGraphImage } from "@/lib/open-graph-image";
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
  draftXLikedAutopostContent,
  XLikedAutopostWriterError,
  type XLikedAutopostWriterResult,
} from "@/lib/x-liked-autopost-writer";
import {
  buildXLikedDedupKey,
  buildFaithfulXLikedFallbackPostContent,
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
import {
  notifyXLikedAutopostOperationalFailure,
  type XLikedAutopostOperationalFailure,
} from "@/lib/x-liked-autopost-notifications";
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
    "https://social.maxpetrusenko.com"
  ).replace(/\/+$/, "");
  return `${base}/dashboard/pipeline?runId=${encodeURIComponent(runId)}`;
}

function buildXLikedFallbackWriterResult(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  hasMedia: boolean;
}): XLikedAutopostWriterResult {
  return {
    content: buildFaithfulXLikedFallbackPostContent(input),
    model: "faithful-curation-fallback",
    modelSource: "local",
    traceUrl: null,
  };
}

function buildWriterOperationalFailure(input: {
  error: XLikedAutopostWriterError;
}): XLikedAutopostOperationalFailure | null {
  if (input.error.code === "quality_rejected") return null;
  return {
    platform: "writer",
    classification: "writer_unavailable",
    error: input.error.message,
  };
}

function buildPublishOperationalFailures(
  errors: Array<{ platform: string; error: string; classification: string }>
): XLikedAutopostOperationalFailure[] {
  return errors.map((error) => ({
    platform: error.platform,
    classification: error.classification as XLikedAutopostOperationalFailure["classification"],
    error: error.error,
  }));
}

function classifyThrownPublishError(error: unknown): PublishResult["classification"] {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("api_key") ||
    normalized.includes("token") ||
    normalized.includes("auth") ||
    normalized.includes("401") ||
    normalized.includes("403")
  ) {
    return "auth_error";
  }

  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "rate_limited";
  }

  if (
    normalized.includes("fetch") ||
    normalized.includes("network") ||
    normalized.includes("timeout") ||
    normalized.includes("econn")
  ) {
    return "network_error";
  }

  return "provider_error";
}

function buildThrownPublishSummary(
  targets: Array<{ platform: PlatformRow }>,
  error: unknown
) {
  const message = error instanceof Error ? error.message : String(error);
  const classification = classifyThrownPublishError(error);
  const outcomes: PublishResult[] = targets.map((target) => ({
    platform: target.platform.type,
    provider:
      target.platform.provider === "bird"
        ? "bird"
        : target.platform.provider === "direct"
          ? "direct"
          : "late",
    accountId: target.platform.accountId,
    success: false,
    classification,
    error: message,
  }));

  return {
    outcomes,
    published: [],
    errors: outcomes.map((outcome) => ({
      platform: outcome.platform,
      error: outcome.error ?? message,
      classification: outcome.classification,
    })),
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
    const now = new Date();
    const runId = crypto.randomUUID();
    const runSteps: PipelineStep[] = [
      completedStep("x-like:source-captured", now, {
        sourceUrl,
        authorHandle,
        tweetId: tweet.id ?? null,
        mediaUrl: media?.url ?? null,
        externalUrls: getXLikedExternalUrls({ tweet, sourceText: cleanText }),
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
    let writerOperationalFailure: XLikedAutopostOperationalFailure | null = null;
    try {
      writer = await draftXLikedAutopostContent({
        workspaceId: options.workspaceId,
        authorHandle,
        sourceUrl,
        sourceText: cleanText,
        hasMedia: Boolean(media),
        mediaType: media?.mediaType ?? null,
      });
      runSteps.push(
        completedStep("x-like:draft", new Date(), {
          strategy: "ai",
          model: writer.model,
          modelSource: writer.modelSource,
          traceUrl: writer.traceUrl,
        }),
        completedStep("x-like:judge", new Date(), {
          status: "passed",
          rubric: [
            "source_fidelity",
            "max_voice",
            "specificity",
            "platform_fit",
          ],
        })
      );
    } catch (error) {
      const writerError =
        error instanceof Error ? error.message : String(error);
      if (error instanceof XLikedAutopostWriterError) {
        writerOperationalFailure = buildWriterOperationalFailure({ error });
      }
      writer = buildXLikedFallbackWriterResult({
        authorHandle,
        sourceUrl,
        sourceText: cleanText,
        hasMedia: Boolean(media),
      });
      runSteps.push(
        completedStep("x-like:draft", new Date(), {
          strategy: "ai",
          status: "rejected_or_unavailable",
          error: writerError,
        }),
        completedStep("x-like:research", new Date(), {
          status: "source-captured",
          sourceUrl,
          externalUrls: getXLikedExternalUrls({ tweet, sourceText: cleanText }),
          note: "Hermes/web repair path fell back to faithful curation for this first slice.",
        }),
        completedStep("x-like:faithful-curation", new Date(), {
          reason:
            error instanceof XLikedAutopostWriterError
              ? error.code
              : "writer_error",
          model: writer.model,
          contentLength: writer.content.length,
        })
      );
    }

    const content = writer.content;

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

    const postId = crypto.randomUUID();
    const mediaUrl = await snapshotMedia(options.workspaceId, tweet.id, media);
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

    runSteps.push(
      completedStep("x-like:packet-ready", new Date(), {
        contentLength: content.length,
        mediaUrl,
        targets: publishTargets.map((target) => ({
          platform: target.platform.type,
          contentLength: target.content.length,
          mediaType: target.mediaType ?? null,
        })),
      })
    );

    await db.update(pipelineRuns).set({
      steps: [...runSteps, runningStep("publish", new Date())],
    }).where(eq(pipelineRuns.id, runId));

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
        dashboardUrl: getDashboardRunUrl(runId),
        tweetId: tweet.id ?? null,
        authorHandle,
        contentMachine: {
          invariant: "like_creates_publishing_obligation",
          fallbackAllowed: true,
          lowQualityAction: "research_or_faithful_curation",
        },
        writer: {
          source: writer.model === "faithful-curation-fallback" ? "fallback" : "ai",
          model: writer.model,
          modelSource: writer.modelSource,
          traceUrl: writer.traceUrl,
        },
      },
      createdAt: now,
      updatedAt: now,
    });

    const summary = await publishPlatformTargets(publishTargets).catch((error) =>
      buildThrownPublishSummary(publishTargets, error)
    );
    const postStatus = resolvePostStatusFromTargetResults(summary.outcomes);
    const completedAt = new Date();
    const publishFailures = buildPublishOperationalFailures(summary.errors);
    const operationalFailures = [
      ...(writerOperationalFailure ? [writerOperationalFailure] : []),
      ...publishFailures,
    ];
    const telegramResult = await notifyXLikedAutopostOperationalFailure({
      runId,
      workspaceId: options.workspaceId,
      sourceUrl,
      failures: operationalFailures,
    }).catch((error) => ({
      status: "failed" as const,
      error: error instanceof Error ? error.message : String(error),
    }));

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
        ...runSteps,
        {
          name: "publish",
          status: summary.errors.length > 0 ? "failed" : "completed",
          startedAt: now.toISOString(),
          completedAt: completedAt.toISOString(),
          output: summary,
          error: summary.errors.map((error) => `${error.platform}: ${error.error}`).join("; ") || undefined,
        },
        completedStep("x-like:telegram-alert", completedAt, {
          result: telegramResult,
          operationalFailures,
        }),
        completedStep("x-like:gbrain-learning", completedAt, {
          status: "ready",
          note: "Run evidence is persisted for gbrain ingestion: source, draft, fallback, publish outcome, and Telegram result.",
        }),
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
