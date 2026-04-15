import crypto from "node:crypto";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { pipelineRuns, platforms, replyEvents, schedules } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { REPLY_TARGETS, type ReplyCandidate } from "@/lib/replies/config";
import {
  getMentions,
  getReplyCount,
  getRetweetCount,
  getTweetAuthor,
  getTweetUrl,
  isReplyTweet,
  searchTweets,
} from "@/lib/replies/bird";
import { generateAiReplyDraftsBatch } from "@/lib/replies/ai";
import {
  filterUntriedReplyDrafts,
  isDuplicateReplyError,
  normalizeReplyText,
} from "@/lib/replies/duplicate-guard";
import { inferReplyDirection } from "@/lib/replies/strategy";
import { sendReplyViaPlatform } from "@/lib/replies/transport";

type ScheduleRow = typeof schedules.$inferSelect;
type TriggerKind = "cron" | "manual" | "api";
type SkippedReplyAttempt = {
  candidate: ReplyCandidate;
  replyText: string | null;
  error: string;
};
type ReplySendResult =
  | {
      kind: "sent";
      candidate: ReplyCandidate;
      replyText: string;
      replyUrl: string;
      skippedErrors: string[];
      skippedAttempts: SkippedReplyAttempt[];
    }
  | {
      kind: "skipped";
      skippedErrors: string[];
      skippedAttempts: SkippedReplyAttempt[];
    };

type CandidateSeed = Omit<ReplyCandidate, "drafts">;

export async function runReplyEngineJob(
  schedule: ScheduleRow,
  trigger: TriggerKind = "cron"
): Promise<void> {
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const steps: PipelineStep[] = [];

  console.log(`[reply-engine] run ${runId} start`);

  await db.insert(pipelineRuns).values({
    id: runId,
    workspaceId: schedule.workspaceId,
    scheduleId: schedule.id,
    postId: null,
    trigger,
    status: "running",
    steps: [],
    startedAt,
  });

  let selectedCandidate: ReplyCandidate | null = null;
  let selectedReplyText: string | null = null;
  let targetPlatformId: string | null = null;

  try {
    const targetPlatform = await resolveXPlatform(schedule);
    if (!targetPlatform) {
      throw new Error("Reply engine needs an enabled X platform target");
    }
    targetPlatformId = targetPlatform.id;

    const discoverStep = step("reply:discover");
    steps.push(discoverStep);
    const candidates = await discoverCandidates();
    complete(discoverStep, {
      count: candidates.length,
      authors: candidates.slice(0, 5).map((candidate) => candidate.author),
    });

    if (candidates.length === 0) {
      throw new Error("No reply candidates");
    }

    const chooseStep = step("reply:select");
    steps.push(chooseStep);
    complete(chooseStep, {
      candidateCount: candidates.length,
      candidates: candidates.map((candidate) => ({
        tweetUrl: candidate.tweetUrl,
        author: candidate.author,
        lane: candidate.lane,
        riskScore: candidate.riskScore,
      })),
    });

    const sendStep = step("publish");
    steps.push(sendStep);

    const sendResult = await sendFirstAvailableReply(candidates, targetPlatform);

    if (sendResult.kind === "skipped") {
      complete(sendStep, {
        published: [],
        replies: [],
        errors: sendResult.skippedErrors,
        skipped: sendResult.skippedAttempts.map((attempt) => ({
          author: attempt.candidate.author,
          tweetUrl: attempt.candidate.tweetUrl,
          replyText: attempt.replyText,
          reason: attempt.error,
        })),
      });

      if (sendResult.skippedAttempts.length > 0) {
        await db.insert(replyEvents).values(
          sendResult.skippedAttempts.map((attempt) => ({
            id: crypto.randomUUID(),
            workspaceId: schedule.workspaceId,
            runId,
            scheduleId: schedule.id,
            platformId: targetPlatformId,
            tweetUrl: attempt.candidate.tweetUrl,
            replyUrl: null,
            authorHandle: attempt.candidate.author,
            category: attempt.candidate.category,
            lane: attempt.candidate.lane,
            replyText: attempt.replyText,
            status: "skipped" as const,
            error: attempt.error,
            metadata: {
              riskScore: attempt.candidate.riskScore,
              reason: attempt.candidate.reason,
            },
            createdAt: new Date(),
          }))
        );
      }

      const now = new Date();
      await db
        .update(pipelineRuns)
        .set({
          status: "completed",
          steps,
          durationMs: now.getTime() - startedAt.getTime(),
          completedAt: now,
        })
        .where(eq(pipelineRuns.id, runId));

      console.log(`[reply-engine] run ${runId} skipped`);
      return;
    }

    selectedCandidate = sendResult.candidate;
    selectedReplyText = sendResult.replyText;

    complete(sendStep, {
      published: ["x"],
      replies: [
        {
          author: sendResult.candidate.author,
          tweetUrl: sendResult.candidate.tweetUrl,
          replyUrl: sendResult.replyUrl,
        },
      ],
      errors: sendResult.skippedErrors,
    });

    await db.insert(replyEvents).values({
      id: crypto.randomUUID(),
      workspaceId: schedule.workspaceId,
      runId,
      scheduleId: schedule.id,
      platformId: targetPlatformId,
      tweetUrl: sendResult.candidate.tweetUrl,
      replyUrl: sendResult.replyUrl,
      authorHandle: sendResult.candidate.author,
      category: sendResult.candidate.category,
      lane: sendResult.candidate.lane,
      replyText: sendResult.replyText,
      status: "sent",
      metadata: {
        riskScore: sendResult.candidate.riskScore,
        reason: sendResult.candidate.reason,
      },
      createdAt: new Date(),
    });

    const now = new Date();
    await db
      .update(pipelineRuns)
      .set({
        status: "completed",
        steps,
        durationMs: now.getTime() - startedAt.getTime(),
        completedAt: now,
      })
      .where(eq(pipelineRuns.id, runId));

    console.log(`[reply-engine] run ${runId} done`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await fail(
      runId,
      steps,
      startedAt,
      message,
      schedule.id,
      schedule.workspaceId,
      targetPlatformId,
      selectedCandidate,
      selectedReplyText
    );
  }
}

async function sendFirstAvailableReply(
  candidates: ReplyCandidate[],
  targetPlatform: Pick<typeof platforms.$inferSelect, "provider" | "config" | "handle">
): Promise<ReplySendResult> {
  const skippedErrors: string[] = [];
  const skippedAttempts: SkippedReplyAttempt[] = [];

  for (const candidate of candidates) {
    const attemptedDrafts = await getAttemptedReplyDrafts(candidate.tweetUrl);
    const drafts = filterUntriedReplyDrafts(candidate.drafts, attemptedDrafts);

    if (drafts.length === 0) {
      const error = "All reply drafts already attempted for this tweet";
      skippedErrors.push(`${candidate.author}: ${error}`);
      skippedAttempts.push({ candidate, replyText: null, error });
      continue;
    }

    for (const draft of drafts) {
      try {
        const { replyUrl } = await sendReplyViaPlatform(targetPlatform, candidate.tweetUrl, draft);

        return {
          kind: "sent",
          candidate,
          replyText: draft,
          replyUrl,
          skippedErrors,
          skippedAttempts,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        skippedErrors.push(`${candidate.author}: ${message}`);

        if (isDuplicateReplyError(message)) {
          attemptedDrafts.add(normalizeReplyText(draft));
          skippedAttempts.push({ candidate, replyText: draft, error: message });
          continue;
        }

        throw error;
      }
    }
  }

  return {
    kind: "skipped",
    skippedErrors,
    skippedAttempts,
  };
}

async function resolveXPlatform(schedule: ScheduleRow) {
  const targetIds = (schedule.targetPlatformIds || []) as string[];
  if (targetIds.length === 0) return null;

  const rows = await Promise.all(
    targetIds.map((platformId) =>
      db.query.platforms.findFirst({ where: eq(platforms.id, platformId) })
    )
  );

  return (
    rows.find((platform) => platform && (platform.type === "x" || platform.type === "twitter")) ||
    null
  );
}

async function discoverCandidates(): Promise<ReplyCandidate[]> {
  const dailyCount = await getDailyReplyCount();
  if (dailyCount >= REPLY_TARGETS.dailyLimit) {
    return [];
  }

  const candidates: CandidateSeed[] = [];
  const mentions = await getMentions();
  for (const tweet of mentions.slice(0, 5)) {
    const candidate = await buildCandidate(tweet, "mentions", "Engaged with Max's post");
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    for (const query of REPLY_TARGETS.autoDraftSearchQueries.slice(0, 5)) {
      const tweets = await searchTweets(query, 10);
      for (const tweet of tweets.slice(0, 3)) {
        const candidate = await buildCandidate(tweet, query, `Trending in ${query}`);
        if (candidate) candidates.push(candidate);
      }
      if (candidates.length >= 5) break;
    }
  }

  const ranked = candidates
    .filter((candidate) => candidate.lane === "auto_draft")
    .sort((a, b) => a.riskScore - b.riskScore)
    .slice(0, REPLY_TARGETS.burstSize);

  const aiDrafts = await generateAiReplyDraftsBatch(
    ranked.map((candidate) => ({
      tweetId: candidate.tweetId,
      author: candidate.author,
      text: candidate.tweetText,
      tags: [candidate.category, candidate.direction],
      direction: candidate.direction,
      likes: 0,
      views: "0",
      contextLabel: candidate.reason,
    }))
  );

  return ranked.flatMap((candidate) => {
    const drafts = aiDrafts.get(candidate.tweetId) ?? [];
    return drafts.length > 0 ? [{ ...candidate, drafts }] : [];
  });
}

async function buildCandidate(
  tweet: {
    id?: string;
    text?: string;
    createdAt?: string;
    author?: { username?: string; followersCount?: number };
    authorId?: string;
    inReplyToStatusId?: string;
    replyCount?: number;
    retweetCount?: number;
    public_metrics?: { reply_count?: number; retweet_count?: number };
    _raw?: Record<string, unknown>;
    url?: string;
  },
  category: string,
  reason: string
): Promise<CandidateSeed | null> {
  const author = getTweetAuthor(tweet);
  const tweetUrl = getTweetUrl(tweet);
  const tweetText = tweet.text || "";

  if (!tweet.id || !tweetText.trim()) return null;
  if (isReplyTweet(tweet)) return null;
  if (!isFreshTweet(tweet.createdAt)) return null;

  const alreadyReplied = await db.query.replyEvents.findFirst({
    where: and(eq(replyEvents.tweetUrl, tweetUrl), eq(replyEvents.status, "sent")),
  });
  if (alreadyReplied) return null;

  const isManualOnly = REPLY_TARGETS.manualOnlyAccounts.some(
    (handle) => handle.toLowerCase() === author.toLowerCase()
  );
  const accountReplyCount = await getWeeklyAccountReplies(author);
  const riskScore = calculateRiskScore(tweetText, category, tweet, accountReplyCount);
  const lane = isManualOnly || riskScore >= 5 ? "manual_lock" : "auto_draft";
  const direction = inferReplyDirection({
    text: tweetText,
    category,
    tags: [category],
  });
  if (accountReplyCount >= REPLY_TARGETS.weeklyPerAccountLimit) return null;

  return {
    tweetId: tweet.id,
    tweetUrl,
    tweetText: tweetText.slice(0, 280),
    author,
    authorFollowers: tweet.author?.followersCount || 0,
    category,
    direction,
    riskScore,
    lane,
    reason: isManualOnly ? `@${author} is manual-only` : reason,
  };
}

function isFreshTweet(createdAt?: string) {
  if (!createdAt) return false;

  const createdAtMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdAtMs)) return false;

  const ageMinutes = (Date.now() - createdAtMs) / 60_000;
  return ageMinutes >= 0 && ageMinutes <= REPLY_TARGETS.maxTweetAgeMinutes;
}

function calculateRiskScore(
  tweetText: string,
  category: string,
  tweet: {
    author?: { followersCount?: number };
    replyCount?: number;
    retweetCount?: number;
    public_metrics?: { reply_count?: number; retweet_count?: number };
  },
  accountReplyCount: number
) {
  let score = 0;

  if ((tweet.author?.followersCount || 0) > 50_000) score += 3;
  if (["tech", "ai", "founders"].includes(category.toLowerCase())) score += 3;
  if (REPLY_TARGETS.blockedTopics.some((topic) => tweetText.toLowerCase().includes(topic))) score += 2;
  if (getReplyCount(tweet) > 100 || (getRetweetCount(tweet) > 200 && getReplyCount(tweet) > 50)) score += 2;
  if (accountReplyCount > 0) score += 1;

  return Math.min(score, 10);
}

async function getDailyReplyCount() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select()
    .from(replyEvents)
    .where(and(eq(replyEvents.status, "sent"), gte(replyEvents.createdAt, start)));
  return rows.length;
}

async function getWeeklyAccountReplies(authorHandle: string) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(replyEvents)
    .where(
      and(
        eq(replyEvents.status, "sent"),
        eq(replyEvents.authorHandle, authorHandle),
        gte(replyEvents.createdAt, weekAgo)
      )
    );
  return rows.length;
}

async function getAttemptedReplyDrafts(tweetUrl: string): Promise<Set<string>> {
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

function step(name: string): PipelineStep {
  return { name, status: "running", startedAt: new Date().toISOString() };
}

function complete(stepValue: PipelineStep, output?: unknown) {
  stepValue.status = "completed";
  stepValue.completedAt = new Date().toISOString();
  stepValue.durationMs =
    new Date(stepValue.completedAt).getTime() - new Date(stepValue.startedAt || stepValue.completedAt).getTime();
  stepValue.output = output;
}

async function fail(
  runId: string,
  steps: PipelineStep[],
  startedAt: Date,
  error: string,
  scheduleId: string,
  workspaceId: string | null,
  platformId: string | null,
  candidate: ReplyCandidate | null,
  replyText: string | null
) {
  const sendStep = steps.find((stepValue) => stepValue.name === "publish");
  if (sendStep && sendStep.status === "running") {
    sendStep.status = "failed";
    sendStep.error = error;
    sendStep.completedAt = new Date().toISOString();
  }

  await db
    .update(pipelineRuns)
    .set({
      status: "failed",
      steps,
      error,
      durationMs: Date.now() - startedAt.getTime(),
      completedAt: new Date(),
    })
    .where(eq(pipelineRuns.id, runId));

  if (candidate) {
    await db.insert(replyEvents).values({
      id: crypto.randomUUID(),
      workspaceId,
      runId,
      scheduleId,
      platformId,
      tweetUrl: candidate.tweetUrl,
      replyUrl: null,
      authorHandle: candidate.author,
      category: candidate.category,
      lane: candidate.lane,
      replyText,
      status: "failed",
      error,
      metadata: {
        riskScore: candidate.riskScore,
        reason: candidate.reason,
      },
      createdAt: new Date(),
    });
  }

  console.error(`[reply-engine] run ${runId} FAILED: ${error}`);
}
