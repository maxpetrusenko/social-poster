import { REPLY_AUTO_DRAFT_SEARCH_QUERIES, type ReplyDirection } from "@/lib/replies/strategy";

export const REPLY_TARGETS = {
  manualOnlyAccounts: [
    "karpathy",
    "ylecun",
    "hardmaru",
    "gwern",
    "sama",
    "anthicdotai",
    "emollick",
    "jacksonwofford",
    "andrew_ng",
    "demishassabis",
    "elonmusk",
    "naval",
    "johncarterco",
    "pmarca",
    "thisissethsblog",
    "vergebot",
    "ycombinator",
    "techcrunch",
    "arstechnica",
  ],
  autoDraftSearchQueries: REPLY_AUTO_DRAFT_SEARCH_QUERIES,
  blockedTopics: [
    "politics",
    "election",
    "partisan",
    "culture war",
    "discourse",
    "ratio",
    "dunk on",
    "cancel",
  ],
  dailyLimit: 60,
  weeklyPerAccountLimit: 2,
  burstSize: 3,
  cooldownMinutes: 10,
  maxTweetAgeMinutes: 30,
} as const;

export type ReplyLane = "auto_draft" | "manual_lock";

export type ReplyCandidate = {
  tweetId: string;
  tweetUrl: string;
  tweetText: string;
  author: string;
  authorFollowers: number;
  category: string;
  direction: ReplyDirection;
  riskScore: number;
  lane: ReplyLane;
  drafts: string[];
  reason: string;
};
