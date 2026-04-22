import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { platforms } from "@/db/schema";
import {
  buildBirdEnv,
  buildBirdMentionCommandArgs,
  resolveBirdCredentialsFromSource,
} from "@/lib/pipeline/bird-publisher-core";

const execFileAsync = promisify(execFile);

const BIRD_PACKAGE = "@steipete/bird";
const BIRD_RUNNER = process.env.BIRD_RUNNER || "npx";

export type BirdTweet = {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: string;
  likeCount?: number;
  favoriteCount?: number;
  viewCount?: number;
  created_at?: string;
  favorite_count?: number;
  view_count?: number;
  author?: {
    username?: string;
    name?: string;
    followersCount?: number;
  };
  authorId?: string;
  inReplyToStatusId?: string;
  replyCount?: number;
  retweetCount?: number;
  public_metrics?: {
    reply_count?: number;
    retweet_count?: number;
    like_count?: number;
    impression_count?: number;
  };
  _raw?: Record<string, unknown>;
};

type PlatformRow = typeof platforms.$inferSelect;
type BirdPlatform = Pick<PlatformRow, "config"> & Partial<Pick<PlatformRow, "handle">>;

function stripBirdAuthFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const nextEnv = { ...env };
  delete nextEnv.AUTH_TOKEN;
  delete nextEnv.X_AUTH_TOKEN;
  delete nextEnv.CT0;
  delete nextEnv.X_CT0;
  return nextEnv;
}

function buildBirdAuthFromEnv() {
  const authToken = process.env.X_AUTH_TOKEN || process.env.AUTH_TOKEN;
  const ct0 = process.env.X_CT0 || process.env.CT0;

  if (!authToken || !ct0) return null;

  return {
    args: ["--auth-token", authToken, "--ct0", ct0] as string[],
    env: process.env,
  };
}

function buildBirdArgsFromPlatform(platform?: BirdPlatform, allowEnvAuth = true) {
  if (!platform) {
    const envAuth = allowEnvAuth ? buildBirdAuthFromEnv() : null;
    if (envAuth) return envAuth;

    return {
      args: [],
      env: stripBirdAuthFromEnv(),
    };
  }

  const stored = readStoredConnectionConfig(platform.config);
  const credentials = resolveBirdCredentialsFromSource(stored.credentials ?? {});
  const args: string[] = [];

  if (credentials.authToken && credentials.ct0) {
    args.push("--auth-token", credentials.authToken, "--ct0", credentials.ct0);
    return {
      args,
      env: buildBirdEnv(credentials, stripBirdAuthFromEnv()),
    };
  }

  if (credentials.chromeProfileDir) {
    args.push("--chrome-profile-dir", credentials.chromeProfileDir);
  } else if (credentials.chromeProfile) {
    args.push("--chrome-profile", credentials.chromeProfile);
  }

  if (credentials.firefoxProfile) {
    args.push("--firefox-profile", credentials.firefoxProfile);
  }

  if (args.length > 0) {
    return {
      args,
      env: stripBirdAuthFromEnv(),
    };
  }

  const envAuth = allowEnvAuth ? buildBirdAuthFromEnv() : null;
  if (envAuth) return envAuth;

  return {
    args,
    env: stripBirdAuthFromEnv(),
  };
}

async function runBird(
  args: string[],
  expectJson = true,
  platform?: BirdPlatform,
  allowEnvAuth = true
): Promise<unknown> {
  const auth = buildBirdArgsFromPlatform(platform, allowEnvAuth);
  const commandArgs = [...auth.args, ...buildBirdMentionCommandArgs(args, platform?.handle)];
  const runnerArgs = BIRD_RUNNER === "npx" ? ["-y", BIRD_PACKAGE, ...commandArgs] : commandArgs;

  let stdout: string;

  try {
    const result = await execFileAsync(BIRD_RUNNER, runnerArgs, {
      timeout: 30_000,
      env: auth.env,
      maxBuffer: 8 * 1024 * 1024,
    });
    stdout = result.stdout;
  } catch (error) {
    throw normalizeBirdExecError(error, auth.args);
  }

  const output = stdout.trim();
  if (!expectJson) return output;
  return parseBirdJson(output);
}

function parseBirdJson(output: string) {
  if (!output) {
    throw new Error("Bird returned empty JSON output");
  }

  const objectIndex = output.indexOf("{");
  const arrayIndex = output.indexOf("[");
  const startIndex =
    objectIndex === -1 ? arrayIndex : arrayIndex === -1 ? objectIndex : Math.min(objectIndex, arrayIndex);

  if (startIndex === -1) {
    throw new Error(`Bird did not return JSON. Output: ${output}`);
  }

  return JSON.parse(output.slice(startIndex));
}

function coerceTweets(payload: unknown): BirdTweet[] {
  if (Array.isArray(payload)) return payload as BirdTweet[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.tweets)) return record.tweets as BirdTweet[];
    if (record.tweet && typeof record.tweet === "object") return [record.tweet as BirdTweet];
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

export function getLikeCount(tweet: BirdTweet): number {
  return tweet.likeCount || tweet.favoriteCount || tweet.favorite_count || tweet.public_metrics?.like_count || 0;
}

export function getViewCount(tweet: BirdTweet): number {
  const rawViews = tweet._raw?.views;
  const rawCount =
    rawViews && typeof rawViews === "object" && typeof (rawViews as { count?: unknown }).count === "string"
      ? Number((rawViews as { count: string }).count)
      : 0;

  return rawCount || tweet.viewCount || tweet.view_count || tweet.public_metrics?.impression_count || 0;
}

export function getTweetText(tweet: BirdTweet): string {
  return tweet.text || "";
}

export function getTweetCreatedAt(tweet: BirdTweet): string | undefined {
  return tweet.createdAt || tweet.created_at;
}

export function getTweetAuthorName(tweet: BirdTweet): string {
  return tweet.author?.name || getTweetAuthor(tweet);
}

export function getTweetImageUrl(tweet: BirdTweet): string | null {
  const raw = tweet._raw;
  if (!raw || typeof raw !== "object") return null;

  const card = (raw as { card?: unknown }).card;
  if (card && typeof card === "object") {
    const legacy = (card as { legacy?: unknown }).legacy;
    if (legacy && typeof legacy === "object") {
      const bindingValues = (legacy as { binding_values?: unknown }).binding_values;
      if (Array.isArray(bindingValues)) {
        const imageBinding = bindingValues.find((entry) => {
          if (!entry || typeof entry !== "object") return false;
          const key = (entry as { key?: unknown }).key;
          return typeof key === "string" && /(photo|summary|thumbnail)_image.*(original|x_large|large)$/.test(key);
        });

        if (imageBinding && typeof imageBinding === "object") {
          const value = (imageBinding as { value?: unknown }).value;
          const imageValue =
            value && typeof value === "object" ? (value as { image_value?: unknown }).image_value : null;
          const url =
            imageValue && typeof imageValue === "object"
              ? (imageValue as { url?: unknown }).url
              : null;
          if (typeof url === "string" && url.length > 0) {
            return url;
          }
        }
      }
    }
  }

  const legacy = (raw as { legacy?: unknown }).legacy;
  if (!legacy || typeof legacy !== "object") return null;

  const mediaSources = [
    (legacy as { extended_entities?: unknown }).extended_entities,
    (legacy as { entities?: unknown }).entities,
  ];

  for (const source of mediaSources) {
    if (!source || typeof source !== "object") continue;
    const media = (source as { media?: unknown }).media;
    if (!Array.isArray(media)) continue;

    for (const entry of media) {
      if (!entry || typeof entry !== "object") continue;
      const mediaUrlHttps = (entry as { media_url_https?: unknown }).media_url_https;
      if (typeof mediaUrlHttps === "string" && mediaUrlHttps.length > 0) return mediaUrlHttps;
      const mediaUrl = (entry as { media_url?: unknown }).media_url;
      if (typeof mediaUrl === "string" && mediaUrl.length > 0) return mediaUrl;
    }
  }

  return null;
}

export function isReplyTweet(tweet: BirdTweet): boolean {
  if (tweet.inReplyToStatusId) return true;

  const raw = tweet._raw;
  if (!raw || typeof raw !== "object") return false;

  const legacy = (raw as { legacy?: unknown }).legacy;
  if (!legacy || typeof legacy !== "object") return false;

  const replyId = (legacy as { in_reply_to_status_id_str?: unknown }).in_reply_to_status_id_str;
  return typeof replyId === "string" && replyId.length > 0;
}

export async function getMentions(): Promise<BirdTweet[]> {
  return coerceTweets(await runBird(["mentions", "--json"]));
}

export async function searchTweets(query: string, count = 20): Promise<BirdTweet[]> {
  return coerceTweets(await runBirdSearch(query, count));
}

export async function getMentionsForPlatform(
  platform: BirdPlatform,
  count = 10,
  full = false
): Promise<BirdTweet[]> {
  return coerceTweets(
    await runBird(
      ["mentions", full ? "--json-full" : "--json", "-n", String(count)],
      true,
      platform
    )
  );
}

export async function searchTweetsForPlatform(
  platform: BirdPlatform,
  query: string,
  count = 20
): Promise<BirdTweet[]> {
  return coerceTweets(await runBirdSearch(query, count, platform));
}

export async function getHomeTimeline(count = 20, full = false): Promise<BirdTweet[]> {
  return coerceTweets(await runBird(["home", full ? "--json-full" : "--json", "--count", String(count)]));
}

export async function getHomeTimelineFromInstalledSession(count = 20, full = false): Promise<BirdTweet[]> {
  return coerceTweets(
    await runBird(["home", full ? "--json-full" : "--json", "--count", String(count)], true, undefined, false)
  );
}

export async function getHomeTimelineForPlatform(
  platform: BirdPlatform,
  count = 20,
  full = false
): Promise<BirdTweet[]> {
  return coerceTweets(
    await runBird(
      ["home", full ? "--json-full" : "--json", "--count", String(count)],
      true,
      platform
    )
  );
}

export async function readTweetForPlatform(
  platform: BirdPlatform,
  tweetUrl: string,
  full = false
): Promise<BirdTweet | null> {
  const tweets = coerceTweets(
    await runBird(["read", tweetUrl, full ? "--json-full" : "--json"], true, platform)
  );
  return tweets[0] ?? null;
}

export async function getThreadForPlatform(
  platform: BirdPlatform,
  tweetUrl: string
): Promise<BirdTweet[]> {
  return coerceTweets(await runBird(["thread", tweetUrl, "--json"], true, platform));
}

export async function sendBirdReply(
  tweetUrl: string,
  text: string,
  platform?: BirdPlatform
): Promise<string | null> {
  const output = String(await runBird(["reply", tweetUrl, text], false, platform));
  for (const line of output.split("\n")) {
    const value = line.trim().replace(/^🔗\s+/, "");
    if (value.startsWith("https://x.com/")) {
      return value;
    }
  }
  return null;
}

async function runBirdSearch(
  query: string,
  count: number,
  platform?: BirdPlatform
) {
  const attempts: Array<{ args: string[]; waitMs: number }> = [
    { args: ["search", query, "--json", "--count", String(count)], waitMs: 0 },
    { args: ["search", query, "--json", "--count", String(Math.max(2, Math.ceil(count / 2)))], waitMs: 750 },
  ];

  let lastError: Error | null = null;

  for (const [index, attempt] of attempts.entries()) {
    if (attempt.waitMs > 0) {
      await sleep(attempt.waitMs);
    }

    try {
      return await runBird(attempt.args, true, platform);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastError = normalized;
      if (!isBirdOverCapacityError(normalized) || index === attempts.length - 1) {
        break;
      }
    }
  }

  if (lastError && isBirdOverCapacityError(lastError)) {
    console.warn(`[bird] search overcapacity for query "${query}", skipping for now`);
    return [];
  }

  throw lastError ?? new Error("Bird search failed");
}

function normalizeBirdExecError(error: unknown, authArgs: string[] = []) {
  if (!error || typeof error !== "object") {
    return new Error(redactBirdAuth(String(error), authArgs));
  }

  const maybeError = error as {
    message?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  };

  const parts = [
    typeof maybeError.message === "string" ? maybeError.message.trim() : "",
    typeof maybeError.stderr === "string" ? maybeError.stderr.trim() : "",
    typeof maybeError.stdout === "string" ? maybeError.stdout.trim() : "",
  ].filter(Boolean);

  return new Error(redactBirdAuth(parts.join("\n"), authArgs));
}

function redactBirdAuth(value: string, authArgs: string[]) {
  let redacted = value;
  for (const flag of ["--auth-token", "--ct0"]) {
    const index = authArgs.indexOf(flag);
    const secret = index >= 0 ? authArgs[index + 1] : null;
    if (!secret) continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

function isBirdOverCapacityError(error: Error) {
  return /OverCapacity/i.test(error.message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
