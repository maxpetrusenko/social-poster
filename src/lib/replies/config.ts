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
  autoDraftSearchQueries: [
    "mindfulness practice",
    "breathwork",
    "embodied cognition",
    "somatic practice",
    "contemplative",
    "movement practice",
    "philosophy of mind",
    "stoicism",
    "fitness routine",
    "biohacking",
    "psychology of learning",
    "consciousness",
    "meditation",
    "nature philosophy",
    "art theory",
  ],
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
  dailyLimit: 20,
  weeklyPerAccountLimit: 2,
  burstSize: 3,
  cooldownMinutes: 90,
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
  riskScore: number;
  lane: ReplyLane;
  drafts: string[];
  reason: string;
};
