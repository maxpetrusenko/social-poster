import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BIRD_PACKAGE = "@steipete/bird";
const BIRD_RUNNER = process.env.BIRD_RUNNER || "npx";

type BirdTweet = {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  author?: {
    username?: string;
    name?: string;
    followersCount?: number;
  };
  authorId?: string;
  replyCount?: number;
  retweetCount?: number;
  public_metrics?: {
    reply_count?: number;
    retweet_count?: number;
  };
};

function getBirdAuth(): { authToken: string; ct0: string } {
  const authToken = process.env.X_AUTH_TOKEN || process.env.AUTH_TOKEN;
  const ct0 = process.env.X_CT0 || process.env.CT0;

  if (!authToken || !ct0) {
    throw new Error("Missing X auth env vars");
  }

  return { authToken, ct0 };
}

async function runBird(args: string[], expectJson = true): Promise<unknown> {
  const { authToken, ct0 } = getBirdAuth();
  const commandArgs = ["--auth-token", authToken, "--ct0", ct0, ...args];
  const runnerArgs =
    BIRD_RUNNER === "npx"
      ? ["-y", BIRD_PACKAGE, ...commandArgs]
      : commandArgs;

  const { stdout } = await execFileAsync(BIRD_RUNNER, runnerArgs, {
    timeout: 30_000,
    env: process.env,
    maxBuffer: 8 * 1024 * 1024,
  });

  const output = stdout.trim();
  if (!expectJson) return output;
  return JSON.parse(output);
}

function coerceTweets(payload: unknown): BirdTweet[] {
  if (Array.isArray(payload)) return payload as BirdTweet[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.tweets)) return record.tweets as BirdTweet[];
  }
  return [];
}

export function getTweetAuthor(tweet: BirdTweet): string {
  return tweet.author?.username || tweet.authorId || "unknown";
}

export function getTweetUrl(tweet: BirdTweet): string {
  const author = getTweetAuthor(tweet);
  return tweet.url || `https://x.com/${author}/status/${tweet.id || ""}`;
}

export function getReplyCount(tweet: BirdTweet): number {
  return tweet.replyCount || tweet.public_metrics?.reply_count || 0;
}

export function getRetweetCount(tweet: BirdTweet): number {
  return tweet.retweetCount || tweet.public_metrics?.retweet_count || 0;
}

export async function getMentions(): Promise<BirdTweet[]> {
  return coerceTweets(await runBird(["mentions", "--json"]));
}

export async function searchTweets(query: string, count = 20): Promise<BirdTweet[]> {
  return coerceTweets(await runBird(["search", query, "--json", "--count", String(count)]));
}

export async function sendBirdReply(tweetUrl: string, text: string): Promise<string | null> {
  const output = String(await runBird(["reply", tweetUrl, text], false));
  for (const line of output.split("\n")) {
    const value = line.trim().replace(/^🔗\s+/, "");
    if (value.startsWith("https://x.com/")) {
      return value;
    }
  }
  return null;
}
