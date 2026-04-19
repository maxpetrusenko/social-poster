import crypto from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { platforms, replyCandidates, replyEvents } from "@/db/schema";
import {
  getThreadForPlatform,
  getLikeCount,
  getReplyCount,
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
import { REPLY_TARGETS } from "@/lib/replies/config";
import {
  filterUntriedReplyDrafts,
  isDuplicateReplyError,
  normalizeReplyText,
} from "@/lib/replies/duplicate-guard";
import {
  getReplyProfile,
  isAgentPersonaProfile,
  type ReplyProfile,
  type ReplyProfileId,
} from "@/lib/replies/profiles";
import {
  detectReplyLanguage,
  isReplyLanguageAllowed,
  normalizeReplyLanguage,
  type ReplyLanguage,
} from "@/lib/replies/language";
import {
  LIVE_REPLY_DISCOVERY_QUERIES,
  getReplyDirectionLabel,
  getReplyDirectionSummary,
  inferReplyDirection,
  type ReplyDirection,
} from "@/lib/replies/strategy";
import type { ReplyCard } from "@/components/dashboard/replies-mock-data";

type PlatformRow = typeof platforms.$inferSelect;
type CandidateRow = typeof replyCandidates.$inferSelect;
export const REPLY_REFRESH_MODES = ["auto", "manual"] as const;
export type RefreshReplyMode = (typeof REPLY_REFRESH_MODES)[number];
type InternalRefreshReplyMode = RefreshReplyMode | "auto_fallback" | "manual_fallback";
const MAX_VISIBLE_REPLY_CARDS = 10;
const AUTO_REVIEW_TARGET = 3;
const MANUAL_REVIEW_TARGET = 5;
const MAX_THREAD_CONTEXT_FETCHES = 2;
const MIN_DISCOVERY_REPLY_COUNT = 3;
const MIN_DISCOVERY_LIKE_COUNT = 10;
const READY_QUEUE_LOCKS = new Set<string>();
const POSTING_CANDIDATE_LOCKS = new Set<string>();

type ReplyDiscoveryPlan = {
  targetDraftedCount: number;
  queryLimit: number;
  queryTweetCount: number;
  freshnessWindowsHours: number[];
  maxDiscoveryPool: number;
};

export type ReplyRefreshDiagnostics = {
  mode: RefreshReplyMode;
  preservedCount: number;
  insertedCount: number;
  finalCardCount: number;
  passes: ReplyRefreshPassDiagnostics[];
};

type ReplyRefreshPassDiagnostics = {
  label: string;
  queries: string[];
  queryResultCounts: Array<{ query: string; results: number }>;
  tweetsFetched: number;
  emptyTextSkipped: number;
  replySkipped: number;
  staleSkipped: number;
  alreadyRepliedSkipped: number;
  duplicateTweetSkipped: number;
  languageSkipped: number;
  lowEngagementSkipped: number;
  candidateCount: number;
  aiCandidateCount: number;
  zeroDraftCount: number;
  draftedCount: number;
};

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
    direction: ReplyDirection;
    profileId: ReplyProfileId;
    profileLabel: string;
    profileGoal: string;
    profileDestination: string;
    sourceType: "original_post";
    engagement: {
      likes: number;
      views: string;
    };
    mediaUrl: string | null;
    tweetLanguage: "en" | "other";
    threadContext: string[];
  };
};

export async function listReplyCandidates(
  platformId?: string,
  profileId?: ReplyProfileId,
  workspaceId?: string,
  language: ReplyLanguage = "en"
): Promise<ReplyCard[]> {
  const replyLanguage = normalizeReplyLanguage(language);
  const rows = platformId
    ? await db
        .select()
        .from(replyCandidates)
        .where(
          workspaceId
            ? and(
                eq(replyCandidates.platformId, platformId),
                eq(replyCandidates.workspaceId, workspaceId)
              )
            : eq(replyCandidates.platformId, platformId)
        )
        .orderBy(desc(replyCandidates.updatedAt))
    : await db
        .select()
        .from(replyCandidates)
        .orderBy(desc(replyCandidates.updatedAt));
  const scopedRows = workspaceId
    ? rows.filter((row) => row.workspaceId === workspaceId)
    : rows;

  return scopedRows
    .filter((row) => {
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      if (metadata.sourceType !== "original_post") return false;
      if (!profileId) return true;

      const rowProfileId = typeof metadata.profileId === "string" ? metadata.profileId : null;

      if (rowProfileId) return isAgentPersonaProfile(rowProfileId);
      return true;
    })
    .filter((row) => isReplyLanguageAllowed(row.tweetText, replyLanguage))
    .slice(0, MAX_VISIBLE_REPLY_CARDS)
    .map(mapRowToCard);
}

export async function processReadyReplyQueue(
  platformId?: string,
  workspaceId?: string
) {
  const platformIds = platformId ? [platformId] : await listReadyPlatformIds(workspaceId);

  for (const id of platformIds) {
    if (!id || READY_QUEUE_LOCKS.has(id)) continue;

    READY_QUEUE_LOCKS.add(id);
    try {
      await processReadyReplyQueueForPlatform(id, workspaceId);
    } finally {
      READY_QUEUE_LOCKS.delete(id);
    }
  }
}

export async function refreshReplyCandidates(
  platformId: string,
  profileId?: ReplyProfileId,
  workspaceId?: string,
  mode: RefreshReplyMode = "manual",
  language: ReplyLanguage = "en"
) {
  const result = await refreshReplyCandidatesWithDiagnostics(
    platformId,
    profileId,
    workspaceId,
    mode,
    language
  );
  return result.cards;
}

export async function refreshReplyCandidatesWithDiagnostics(
  platformId: string,
  profileId?: ReplyProfileId,
  workspaceId?: string,
  mode: RefreshReplyMode = "manual",
  language: ReplyLanguage = "en"
) {
  const platform = await db.query.platforms.findFirst({
    where: eq(platforms.id, platformId),
  });
  const profile = getReplyProfile(profileId);

  if (!platform || (workspaceId && platform.workspaceId !== workspaceId)) {
    throw new Error("X connection not found");
  }

  if (!["twitter", "x"].includes(platform.type)) {
    throw new Error("Reply discovery requires an X connection");
  }

  const existingRows = await db
    .select()
    .from(replyCandidates)
    .where(eq(replyCandidates.platformId, platform.id));
  const discoveryPlan = getReplyDiscoveryPlan(mode);
  const preservedTweetUrls = new Set(
    existingRows
      .filter((row) => row.status === "ready" || row.status === "posted")
      .map((row) => row.tweetUrl)
  );
  const passes: ReplyRefreshPassDiagnostics[] = [];

  let draftedResult = await discoverAndDraftLiveCandidates(
    platform,
    profile,
    discoveryPlan,
    `${mode}:primary`,
    language
  );
  let drafted = draftedResult.drafted;
  passes.push(draftedResult.diagnostics);

  if (mode === "auto" && drafted.length === 0) {
    draftedResult = await discoverAndDraftLiveCandidates(
      platform,
      profile,
      getReplyDiscoveryPlan("auto_fallback"),
      "auto:fallback",
      language
    );
    drafted = draftedResult.drafted;
    passes.push(draftedResult.diagnostics);
  }

  if (drafted.length === 0 && mode !== "manual") {
    draftedResult = await discoverAndDraftLiveCandidates(
      platform,
      profile,
      getReplyDiscoveryPlan("manual"),
      "manual:escalation",
      language
    );
    drafted = draftedResult.drafted;
    passes.push(draftedResult.diagnostics);
  }

  if (drafted.length === 0 && mode === "manual") {
    draftedResult = await discoverAndDraftLiveCandidates(
      platform,
      profile,
      getReplyDiscoveryPlan("manual_fallback"),
      "manual:fallback",
      language
    );
    drafted = draftedResult.drafted;
    passes.push(draftedResult.diagnostics);
  }

  await db
    .delete(replyCandidates)
    .where(
      and(
        eq(replyCandidates.platformId, platform.id),
        ne(replyCandidates.status, "ready"),
        ne(replyCandidates.status, "posted")
      )
    );

  let insertedCount = 0;
  for (const item of drafted) {
    if (preservedTweetUrls.has(item.tweetUrl)) continue;

    const now = new Date();
    await db.insert(replyCandidates).values({
      id: crypto.randomUUID(),
      workspaceId: platform.workspaceId,
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
    insertedCount += 1;
  }

  const cards = await listReplyCandidates(
    platformId,
    profile.id,
    workspaceId,
    language
  );

  return {
    cards,
    diagnostics: {
      mode,
      preservedCount: preservedTweetUrls.size,
      insertedCount,
      finalCardCount: cards.length,
      passes,
    } satisfies ReplyRefreshDiagnostics,
  };
}

export async function updateReplyCandidateStatus(
  candidateId: string,
  status: CandidateRow["status"],
  selectedDraftIndex?: number,
  workspaceId?: string
) {
  const row = await db.query.replyCandidates.findFirst({
    where: workspaceId
      ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
      : eq(replyCandidates.id, candidateId),
  });

  if (!row) {
    throw new Error("Reply candidate not found");
  }

  const now = new Date();
  const metadata = normalizeReplyMetadata(row.metadata);
  const update: Partial<typeof replyCandidates.$inferInsert> = {
    status,
    updatedAt: now,
    metadata:
      status === "ready"
        ? {
            ...metadata,
            readyAt: metadata.readyAt ?? now.toISOString(),
          }
        : {
            ...metadata,
            readyAt: null,
            queuedForAt: null,
          },
  };

  if (typeof selectedDraftIndex === "number" && Number.isFinite(selectedDraftIndex)) {
    update.selectedDraftIndex = selectedDraftIndex;
  }

  await db.update(replyCandidates).set(update).where(eq(replyCandidates.id, candidateId));
  if (status === "ready" && row.platformId) {
    await processReadyReplyQueue(row.platformId, workspaceId);
  }

  return db.query.replyCandidates.findFirst({
    where: workspaceId
      ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
      : eq(replyCandidates.id, candidateId),
  });
}

export async function updateReplyCandidateDraft(
  candidateId: string,
  index: number,
  text: string,
  workspaceId?: string
) {
  const row = await db.query.replyCandidates.findFirst({
    where: workspaceId
      ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
      : eq(replyCandidates.id, candidateId),
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

  return db.query.replyCandidates.findFirst({
    where: workspaceId
      ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
      : eq(replyCandidates.id, candidateId),
  });
}

export async function postReplyCandidate(candidateId: string, workspaceId?: string) {
  return postReplyCandidateInternal(candidateId, true, workspaceId);
}

async function postReplyCandidateInternal(
  candidateId: string,
  continueQueue: boolean,
  workspaceId?: string
) {
  const waitResult = await waitForCandidatePostingTurn(candidateId);
  if (waitResult) return waitResult;

  POSTING_CANDIDATE_LOCKS.add(candidateId);
  try {
    const row = await db.query.replyCandidates.findFirst({
      where: workspaceId
        ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
        : eq(replyCandidates.id, candidateId),
    });

    if (!row) {
      throw new Error("Reply candidate not found");
    }

    if (row.status === "posted") {
      return row;
    }

    const platform = row.platformId
      ? await db.query.platforms.findFirst({ where: eq(platforms.id, row.platformId) })
      : null;

    if (!platform) {
      throw new Error("X connection missing for this reply");
    }

    const drafts = Array.isArray(row.drafts) ? row.drafts : [];
    const attemptOrder = buildDraftAttemptOrder(drafts, row.selectedDraftIndex || 0);
    const attemptedDrafts = await getAttemptedQueueDrafts(row.tweetUrl);
    const untriedDrafts = new Set(
      filterUntriedReplyDrafts(
        attemptOrder.map((entry) => entry.text),
        attemptedDrafts
      ).map((draft) => normalizeReplyText(draft))
    );
    const draftsToTry = attemptOrder.filter((entry) =>
      untriedDrafts.has(normalizeReplyText(entry.text))
    );

    if (draftsToTry.length === 0) {
      await markReplyCandidateForRedraft(row, "All queue drafts already attempted");
      throw new Error("All queue drafts already attempted");
    }

    const { sendReplyViaPlatform } = await import("@/lib/replies/transport");
    let lastError: Error | null = null;

    for (const draftEntry of draftsToTry) {
      try {
        const { replyUrl } = await sendReplyViaPlatform(platform, row.tweetUrl, draftEntry.text);

        await db.update(replyCandidates).set({
          status: "posted",
          replyUrl,
          selectedDraftIndex: draftEntry.index,
          updatedAt: new Date(),
          metadata: {
            ...normalizeReplyMetadata(row.metadata),
            queuedForAt: null,
            publishedAt: new Date().toISOString(),
          },
          error: null,
        }).where(eq(replyCandidates.id, candidateId));

        await db.insert(replyEvents).values({
          id: crypto.randomUUID(),
          workspaceId: row.workspaceId,
          runId: null,
          scheduleId: null,
          platformId: platform.id,
          tweetUrl: row.tweetUrl,
          replyUrl,
          authorHandle: row.authorHandle,
          category: "live_queue",
          lane: "operator_queue",
          replyText: draftEntry.text,
          status: "sent",
          metadata: {
            score: row.score,
            riskLevel: row.riskLevel,
          },
          createdAt: new Date(),
        });

        if (continueQueue) {
          await processReadyReplyQueue(platform.id, workspaceId);
        }

        return db.query.replyCandidates.findFirst({
          where: workspaceId
            ? and(eq(replyCandidates.id, candidateId), eq(replyCandidates.workspaceId, workspaceId))
            : eq(replyCandidates.id, candidateId),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = error instanceof Error ? error : new Error(message);

        if (isDuplicateReplyError(message)) {
          attemptedDrafts.add(normalizeReplyText(draftEntry.text));
          continue;
        }

        const latestRow = await db.query.replyCandidates.findFirst({
          where: eq(replyCandidates.id, candidateId),
        });

        if (latestRow?.status !== "posted") {
          await db.update(replyCandidates).set({
            error: message,
            updatedAt: new Date(),
          }).where(eq(replyCandidates.id, candidateId));
        }

        throw lastError;
      }
    }

    await markReplyCandidateForRedraft(row, lastError?.message || "All queue drafts were duplicates");
    throw lastError ?? new Error("All queue drafts were duplicates");
  } finally {
    POSTING_CANDIDATE_LOCKS.delete(candidateId);
  }
}

async function discoverLiveCandidates(
  platform: PlatformRow,
  profile: ReplyProfile,
  plan: ReplyDiscoveryPlan,
  language: ReplyLanguage
) {
  const workspaceId = platform.workspaceId;
  const alreadyRepliedRows = workspaceId
    ? await db
        .select({ tweetUrl: replyEvents.tweetUrl })
        .from(replyEvents)
        .where(
          and(
            eq(replyEvents.status, "sent"),
            eq(replyEvents.workspaceId, workspaceId)
          )
        )
    : await db
        .select({ tweetUrl: replyEvents.tweetUrl })
        .from(replyEvents)
        .where(eq(replyEvents.status, "sent"));
  const alreadyReplied = new Set(alreadyRepliedRows.map((row) => row.tweetUrl));

  const found = new Map<string, LiveCandidate>();
  const queries = buildDiscoveryQueryMix(profile, plan.queryLimit);
  let threadFetches = 0;
  const diagnostics: ReplyRefreshPassDiagnostics = {
    label: "",
    queries: queries.map((entry) => entry.query),
    queryResultCounts: [],
    tweetsFetched: 0,
    emptyTextSkipped: 0,
    replySkipped: 0,
    staleSkipped: 0,
    alreadyRepliedSkipped: 0,
    duplicateTweetSkipped: 0,
    languageSkipped: 0,
    lowEngagementSkipped: 0,
    candidateCount: 0,
    aiCandidateCount: 0,
    zeroDraftCount: 0,
    draftedCount: 0,
  };

  for (const maxAgeHours of plan.freshnessWindowsHours) {
    for (const { query, direction } of queries) {
      let tweets: Awaited<ReturnType<typeof searchTweetsForPlatform>> = [];

      try {
        tweets = await searchTweetsForPlatform(platform, query, plan.queryTweetCount);
      } catch (error) {
        console.warn(
          `[replies] discovery query failed for "${query}":`,
          error instanceof Error ? error.message : error
        );
        diagnostics.queryResultCounts.push({ query, results: -1 });
        continue;
      }

      diagnostics.queryResultCounts.push({ query, results: tweets.length });
      diagnostics.tweetsFetched += tweets.length;

      for (const tweet of tweets) {
        const tweetUrl = getTweetUrl(tweet);
        const tweetText = getTweetText(tweet).trim();
        if (!tweet.id || !tweetText) {
          diagnostics.emptyTextSkipped += 1;
          continue;
        }
        if (!isReplyLanguageAllowed(tweetText, language)) {
          diagnostics.languageSkipped += 1;
          continue;
        }
        if (!hasMinimumEngagement(tweet)) {
          diagnostics.lowEngagementSkipped += 1;
          continue;
        }
        if (isReplyTweet(tweet)) {
          diagnostics.replySkipped += 1;
          continue;
        }
        if (!isFreshEnough(getTweetCreatedAt(tweet), maxAgeHours)) {
          diagnostics.staleSkipped += 1;
          continue;
        }
        if (alreadyReplied.has(tweetUrl)) {
          diagnostics.alreadyRepliedSkipped += 1;
          continue;
        }
        if (found.has(tweetUrl)) {
          diagnostics.duplicateTweetSkipped += 1;
          continue;
        }

        const candidate = await buildLiveCandidate(
          platform,
          tweet,
          query,
          direction,
          profile,
          threadFetches < MAX_THREAD_CONTEXT_FETCHES
        );
        if (!candidate) continue;
        if (candidate.metadata.threadContext.length > 1) {
          threadFetches += 1;
        }

        found.set(tweetUrl, candidate);
        if (found.size >= plan.maxDiscoveryPool) break;
      }

      if (found.size >= plan.maxDiscoveryPool) break;
    }

    if (found.size >= plan.targetDraftedCount) break;
  }

  diagnostics.candidateCount = found.size;

  return {
    candidates: Array.from(found.values()).sort((left, right) => right.score - left.score),
    diagnostics,
  };
}

function getReplyDiscoveryPlan(mode: InternalRefreshReplyMode): ReplyDiscoveryPlan {
  if (mode === "auto") {
    return {
      targetDraftedCount: AUTO_REVIEW_TARGET,
      queryLimit: 2,
      queryTweetCount: 3,
      freshnessWindowsHours: [36],
      maxDiscoveryPool: 4,
    };
  }

  if (mode === "auto_fallback") {
    return {
      targetDraftedCount: AUTO_REVIEW_TARGET,
      queryLimit: 3,
      queryTweetCount: 3,
      freshnessWindowsHours: [36, 14 * 24],
      maxDiscoveryPool: 5,
    };
  }

  if (mode === "manual_fallback") {
    return {
      targetDraftedCount: MANUAL_REVIEW_TARGET,
      queryLimit: 6,
      queryTweetCount: 8,
      freshnessWindowsHours: [36, 14 * 24, 45 * 24],
      maxDiscoveryPool: 10,
    };
  }

  return {
    targetDraftedCount: MANUAL_REVIEW_TARGET,
    queryLimit: 3,
    queryTweetCount: 4,
    freshnessWindowsHours: [36, 14 * 24],
    maxDiscoveryPool: 6,
  };
}

function buildDiscoveryQueryMix(profile: ReplyProfile, limit: number) {
  const byDirection = new Map<ReplyDirection, string[]>();

  for (const direction of profile.directions) {
    byDirection.set(
      direction,
      LIVE_REPLY_DISCOVERY_QUERIES.filter((entry) => entry.direction === direction).map(
        (entry) => entry.query
      )
    );
  }

  const mixed: Array<{ query: string; direction: ReplyDirection }> = [];
  const maxPerDirection = Math.max(
    0,
    ...Array.from(byDirection.values()).map((queries) => queries.length)
  );

  for (let index = 0; index < maxPerDirection; index += 1) {
    for (const direction of profile.directions) {
      const query = byDirection.get(direction)?.[index];
      if (!query) continue;
      mixed.push({ query, direction });
      if (mixed.length >= limit) return mixed;
    }
  }

  return mixed;
}

async function discoverAndDraftLiveCandidates(
  platform: PlatformRow,
  profile: ReplyProfile,
  plan: ReplyDiscoveryPlan,
  label: string,
  language: ReplyLanguage
) {
  const discoveredResult = await discoverLiveCandidates(
    platform,
    profile,
    plan,
    language
  );
  const discovered = discoveredResult.candidates;
  const candidateInputs = discovered.map((item) => ({
    tweetId: item.tweetId,
    author: item.authorHandle,
    text: item.tweetText,
    threadContext: item.metadata.threadContext,
    tags: item.tags,
    direction: item.metadata.direction,
    profileId: item.metadata.profileId,
    profileLabel: item.metadata.profileLabel,
    profileGoal: item.metadata.profileGoal,
    profileDestination: item.metadata.profileDestination,
    likes: item.metadata.engagement.likes,
    views: item.metadata.engagement.views,
    contextLabel: item.metadata.query,
  }));
  const aiDrafts = await generateAiReplyDraftsBatch(
    candidateInputs,
    "primary"
  );

  const minimumDraftedCount = Math.min(3, plan.targetDraftedCount);
  const zeroDraftItems = discovered.filter((item) => (aiDrafts.get(item.tweetId) ?? []).length === 0);

  if (zeroDraftItems.length > 0) {
    const initialDraftedCount = discovered.length - zeroDraftItems.length;
    if (initialDraftedCount < minimumDraftedCount) {
      const fallbackDrafts = await generateAiReplyDraftsBatch(
        zeroDraftItems.map((item) => ({
          tweetId: item.tweetId,
          author: item.authorHandle,
          text: item.tweetText,
          threadContext: item.metadata.threadContext,
          tags: item.tags,
          direction: item.metadata.direction,
          profileId: item.metadata.profileId,
          profileLabel: item.metadata.profileLabel,
          profileGoal: item.metadata.profileGoal,
          profileDestination: item.metadata.profileDestination,
          likes: item.metadata.engagement.likes,
          views: item.metadata.engagement.views,
          contextLabel: item.metadata.query,
        })),
        "fallback"
      );

      for (const item of zeroDraftItems) {
        const drafts = fallbackDrafts.get(item.tweetId) ?? [];
        if (drafts.length > 0) {
          aiDrafts.set(item.tweetId, drafts);
        }
      }
    }
  }

  const drafted = discovered
    .flatMap((item) => {
      const drafts = aiDrafts.get(item.tweetId) ?? [];
      return drafts.length > 0 ? [{ ...item, drafts }] : [];
    })
    .slice(0, plan.targetDraftedCount > 0 ? plan.targetDraftedCount : MAX_VISIBLE_REPLY_CARDS);

  const zeroDraftCount = discovered.filter((item) => (aiDrafts.get(item.tweetId) ?? []).length === 0).length;

  return {
    drafted,
    diagnostics: {
      ...discoveredResult.diagnostics,
      label,
      aiCandidateCount: discovered.length,
      zeroDraftCount,
      draftedCount: drafted.length,
    } satisfies ReplyRefreshPassDiagnostics,
  };
}

async function buildLiveCandidate(
  platform: PlatformRow,
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
  query: string,
  presetDirection: ReplyDirection,
  profile: ReplyProfile,
  allowThreadFetch: boolean
): Promise<LiveCandidate | null> {
  const tweetUrl = getTweetUrl(tweet);
  const rootTweet = tweet;
  const replies: PopularReply[] = [];
  const threadContext = await resolveThreadContext(platform, rootTweet, tweetUrl, allowThreadFetch);

  const tweetText = getTweetText(rootTweet).trim();
  if (!tweetText) return null;
  const direction = inferReplyDirection({
    text: tweetText,
    query,
    tags: buildTags(query, tweetText),
  }) || presetDirection;

  const score = calculateScore(rootTweet, query, replies.length);
  const riskLevel = score >= 82 ? "medium" : "low";
  const tags = buildTags(query, tweetText);
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
    tags,
    popularReplies: replies,
    drafts: [],
    postedAtLabel: formatPostedLabel(getTweetCreatedAt(rootTweet)),
    metadata: {
      query,
      direction,
      profileId: profile.id,
      profileLabel: profile.label,
      profileGoal: profile.goal,
      profileDestination: profile.destination,
      sourceType: "original_post",
      engagement: {
        likes: getLikeCount(rootTweet),
        views: compactNumber(getViewCount(rootTweet)),
      },
      mediaUrl: getTweetImageUrl(rootTweet),
      tweetLanguage: detectReplyLanguage(tweetText),
      threadContext,
    },
  };
}

function hasMinimumEngagement(tweet: {
  replyCount?: number;
  public_metrics?: { reply_count?: number; like_count?: number };
  likeCount?: number;
  favoriteCount?: number;
  favorite_count?: number;
}) {
  return (
    getReplyCount(tweet) >= MIN_DISCOVERY_REPLY_COUNT ||
    getLikeCount(tweet) >= MIN_DISCOVERY_LIKE_COUNT
  );
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
  if (lowered.includes("github") || lowered.includes("repo") || lowered.includes("open source")) tags.add("github");
  if (lowered.includes("tool call") || lowered.includes("latency") || lowered.includes("transcript")) tags.add("devtools");
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

function isFreshEnough(createdAt?: string, maxAgeHours = 36) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created <= 1000 * 60 * 60 * maxAgeHours;
}

function compactNumber(value: number) {
  if (!value) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function mapRowToCard(row: CandidateRow): ReplyCard {
  const metadata = normalizeReplyMetadata(row.metadata);
  const engagement =
    metadata.engagement && typeof metadata.engagement === "object"
      ? (metadata.engagement as Record<string, unknown>)
      : {};
  const mediaUrl = typeof metadata.mediaUrl === "string" ? metadata.mediaUrl : null;
  const profileLabel = typeof metadata.profileLabel === "string" ? metadata.profileLabel : null;
  const profileGoal = typeof metadata.profileGoal === "string" ? metadata.profileGoal : null;
  const readyAtLabel = row.status === "ready" ? formatReadyAtLabel(metadata.readyAt) : null;
  const publishStateLabel =
    row.status === "ready" ? formatPublishStateLabel(metadata.queuedForAt) : null;

  return {
    id: row.id,
    profileName: row.authorName || row.authorHandle,
    replyProfileLabel: profileLabel,
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
    readyAtLabel,
    publishStateLabel,
    tags: Array.isArray(row.tags) ? row.tags : [],
    bestAngle: profileLabel || getReplyDirectionLabel(readReplyDirection(row)),
    why: profileGoal || getReplyDirectionSummary(readReplyDirection(row)),
    shouldMentionProduct: getProductMentionMode(readReplyDirection(row)),
    postedAt: row.postedAtLabel || "today",
    engagement: {
      replies: getReplyCountFromRow(row),
      likes: typeof engagement.likes === "number" ? engagement.likes : 0,
      views: typeof engagement.views === "string" ? engagement.views : "0",
    },
    thread: readThreadContext(row),
    popularReplies: Array.isArray(row.popularReplies) ? row.popularReplies : [],
    drafts: Array.isArray(row.drafts) ? row.drafts : [],
  };
}

function readReplyDirection(row: CandidateRow): ReplyDirection {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  const direction = metadata.direction;
  return direction === "product" || direction === "github" ? direction : "dev";
}

function getProductMentionMode(direction: ReplyDirection): "soft" | "no" | "yes" {
  switch (direction) {
    case "product":
      return "yes";
    case "github":
      return "soft";
    case "dev":
      return "no";
  }
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
  const metadata = normalizeReplyMetadata(row.metadata);
  const engagement =
    metadata.engagement && typeof metadata.engagement === "object"
      ? (metadata.engagement as Record<string, unknown>)
      : {};

  return typeof engagement.replies === "number" ? engagement.replies : 0;
}

function readThreadContext(row: CandidateRow) {
  const metadata = normalizeReplyMetadata(row.metadata);
  return Array.isArray(metadata.threadContext) && metadata.threadContext.length > 0
    ? metadata.threadContext.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [row.tweetText];
}

async function listReadyPlatformIds(workspaceId?: string) {
  const rows = workspaceId
    ? await db
        .select()
        .from(replyCandidates)
        .where(eq(replyCandidates.workspaceId, workspaceId))
    : await db.select().from(replyCandidates);
  return Array.from(
    new Set(
      rows
        .filter((row) => row.status === "ready" && row.platformId)
        .map((row) => row.platformId as string)
    )
  );
}

async function processReadyReplyQueueForPlatform(
  platformId: string,
  workspaceId?: string
) {
  const readyRows = (await db
    .select()
    .from(replyCandidates)
    .where(
      workspaceId
        ? and(
            eq(replyCandidates.platformId, platformId),
            eq(replyCandidates.status, "ready"),
            eq(replyCandidates.workspaceId, workspaceId)
          )
        : and(eq(replyCandidates.platformId, platformId), eq(replyCandidates.status, "ready"))
    ))
    .sort(compareReadyRows);

  if (readyRows.length === 0) return;

  const latestSentAt = await getLatestSentReplyAt(platformId, workspaceId);
  const now = Date.now();
  const baseAllowedAt = latestSentAt
    ? Math.max(latestSentAt.getTime() + REPLY_TARGETS.cooldownMinutes * 60_000, now)
    : now;

  const firstRow = readyRows[0];
  const firstQueuedForAt = new Date(baseAllowedAt);

  if (firstQueuedForAt.getTime() <= now) {
    await postReplyCandidateInternal(firstRow.id, false, workspaceId);
    await processReadyReplyQueueForPlatform(platformId, workspaceId);
    return;
  }

  await persistReadyQueueSchedule(readyRows, baseAllowedAt);
}

async function getLatestSentReplyAt(platformId: string, workspaceId?: string) {
  const [lastSent] = await db
    .select({ createdAt: replyEvents.createdAt })
    .from(replyEvents)
    .where(
      workspaceId
        ? and(
            eq(replyEvents.platformId, platformId),
            eq(replyEvents.status, "sent"),
            eq(replyEvents.workspaceId, workspaceId)
          )
        : and(eq(replyEvents.platformId, platformId), eq(replyEvents.status, "sent"))
    )
    .orderBy(desc(replyEvents.createdAt))
    .limit(1);

  return lastSent?.createdAt ?? null;
}

async function persistReadyQueueSchedule(rows: CandidateRow[], baseAllowedAt: number) {
  for (const [index, row] of rows.entries()) {
    const queuedForAt = new Date(baseAllowedAt + index * REPLY_TARGETS.cooldownMinutes * 60_000);
    const metadata = normalizeReplyMetadata(row.metadata);
    const currentQueuedForAt = metadata.queuedForAt;

    if (currentQueuedForAt === queuedForAt.toISOString() && metadata.readyAt) continue;

    await db
      .update(replyCandidates)
      .set({
        metadata: {
          ...metadata,
          readyAt: metadata.readyAt ?? row.updatedAt?.toISOString?.() ?? new Date().toISOString(),
          queuedForAt: queuedForAt.toISOString(),
        },
        updatedAt: row.updatedAt ?? new Date(),
      })
      .where(eq(replyCandidates.id, row.id));
  }
}

async function getAttemptedQueueDrafts(tweetUrl: string) {
  const rows = await db
    .select({
      replyText: replyEvents.replyText,
      status: replyEvents.status,
      error: replyEvents.error,
    })
    .from(replyEvents)
    .where(eq(replyEvents.tweetUrl, tweetUrl));

  const attempted = new Set<string>();

  for (const row of rows) {
    if (!row.replyText) continue;
    if (row.status === "sent" || isDuplicateReplyError(row.error)) {
      attempted.add(normalizeReplyText(row.replyText));
    }
  }

  return attempted;
}

function buildDraftAttemptOrder(drafts: string[], selectedDraftIndex: number) {
  return drafts
    .map((text, index) => ({ text, index }))
    .sort((left, right) => {
      if (left.index === selectedDraftIndex) return -1;
      if (right.index === selectedDraftIndex) return 1;
      return left.index - right.index;
    });
}

async function markReplyCandidateForRedraft(row: CandidateRow, message: string) {
  await db
    .update(replyCandidates)
    .set({
      status: "drafted",
      error: message,
      updatedAt: new Date(),
      metadata: {
        ...normalizeReplyMetadata(row.metadata),
        readyAt: null,
        queuedForAt: null,
      },
    })
    .where(eq(replyCandidates.id, row.id));
}

async function waitForCandidatePostingTurn(candidateId: string) {
  if (!POSTING_CANDIDATE_LOCKS.has(candidateId)) return null;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    if (POSTING_CANDIDATE_LOCKS.has(candidateId)) continue;

    return (
      (await db.query.replyCandidates.findFirst({
        where: eq(replyCandidates.id, candidateId),
      })) ?? null
    );
  }

  throw new Error("Reply is already posting");
}

function compareReadyRows(left: CandidateRow, right: CandidateRow) {
  const leftReadyAt = readQueueDate(normalizeReplyMetadata(left.metadata).readyAt, left.updatedAt);
  const rightReadyAt = readQueueDate(normalizeReplyMetadata(right.metadata).readyAt, right.updatedAt);
  return leftReadyAt.getTime() - rightReadyAt.getTime();
}

function normalizeReplyMetadata(value: Record<string, unknown> | null | undefined) {
  return (value ?? {}) as Record<string, unknown> & {
    readyAt?: string | null;
    queuedForAt?: string | null;
    publishedAt?: string | null;
  };
}

function readQueueDate(value: string | null | undefined, fallback?: Date | null) {
  const parsed = value ? new Date(value) : null;
  if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
  return fallback ?? new Date();
}

function formatReadyAtLabel(value: string | null | undefined) {
  if (!value) return "ready now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ready now";
  return `ready ${relativeMinutes(date)}`;
}

function formatPublishStateLabel(value: string | null | undefined) {
  if (!value) return "posting soon";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "posting soon";

  if (date.getTime() <= Date.now() + 15_000) return "due now";

  return `queued for ${date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  })}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveThreadContext(
  platform: PlatformRow,
  tweet: {
    text?: string;
    author?: { username?: string };
  },
  tweetUrl: string,
  allowThreadFetch: boolean
) {
  const rootText = getTweetText(tweet).trim();
  if (!rootText) return [];
  if (!looksLikeThreadRoot(rootText)) return [rootText];
  if (!allowThreadFetch) return [rootText];

  try {
    const threadTweets = await getThreadForPlatform(platform, tweetUrl);
    const authorHandle = getTweetAuthor(tweet);
    const sameAuthorTweets = threadTweets
      .filter((entry) => getTweetAuthor(entry) === authorHandle)
      .map((entry) => getTweetText(entry).trim())
      .filter(Boolean);

    return uniqueThreadLines([rootText, ...sameAuthorTweets]).slice(0, 8);
  } catch (error) {
    console.warn(
      `[replies] thread fetch failed for "${tweetUrl}":`,
      error instanceof Error ? error.message : error
    );
    return [rootText];
  }
}

function looksLikeThreadRoot(text: string) {
  const lowered = text.toLowerCase();
  return (
    lowered.includes("thread:") ||
    lowered.includes("thread ") ||
    text.includes("🧵") ||
    /^1\/\d*/.test(text.trim())
  );
}

function uniqueThreadLines(lines: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const line of lines) {
    const normalized = line.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(line.trim());
  }

  return unique;
}
