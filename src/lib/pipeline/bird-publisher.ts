import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { platforms } from "@/db/schema";
import { getPublicAppUrlFromEnv } from "@/lib/app-url";
import { readStoredConnectionConfig } from "@/lib/connection-config";

import type { PublishResult } from "./publisher";
import {
  buildBirdEnv,
  classifyBirdError,
  resolveBirdCredentialsFromSource,
  shouldRetryBirdWithInstalledSession,
  splitBirdThreadContent,
  type BirdCredentials,
} from "./bird-publisher-core";

const execFileAsync = promisify(execFile);
const BIRD_PACKAGE = "@steipete/bird";

type PlatformRow = typeof platforms.$inferSelect;

type BirdPublishTarget = {
  platform: PlatformRow;
  content: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  threadLongPosts?: boolean;
};

export function resolveBirdCredentials(
  platform: Pick<PlatformRow, "config" | "provider" | "type">
): BirdCredentials {
  const stored = readStoredConnectionConfig(platform.config);
  return resolveBirdCredentialsFromSource(stored.credentials ?? {});
}

export function resolveBirdThreadParts(
  content: string,
  credentials: Pick<
    BirdCredentials,
    "threadLongPosts" | "tweetCharLimit" | "threadChunkLimit"
  >,
  threadLongPostsOverride?: boolean
) {
  const threadLongPosts = threadLongPostsOverride ?? credentials.threadLongPosts;
  return threadLongPosts && content.length > credentials.tweetCharLimit
    ? splitBirdThreadContent(content, credentials.threadChunkLimit)
    : [content.trim()];
}

function extractBirdUrl(output: string) {
  const match = output.match(/https:\/\/x\.com\/[^\s]+/);
  return match ? match[0] : null;
}

function extractBirdPostId(url: string | null) {
  if (!url) return undefined;
  const match = url.match(/status\/(\d+)/);
  return match ? match[1] : undefined;
}

function buildBirdBaseArgs(credentials: BirdCredentials) {
  const args: string[] = [];

  if (!credentials.authToken && !credentials.ct0 && !credentials.useInstalledBirdSession) {
    throw new Error(
      "Missing Bird auth credentials. Add authToken and ct0 or enable installed Bird session."
    );
  }

  if (credentials.authToken && credentials.ct0) {
    args.push("--auth-token", credentials.authToken, "--ct0", credentials.ct0);
  }

  if (credentials.chromeProfile) {
    args.push("--chrome-profile", credentials.chromeProfile);
  }

  if (credentials.chromeProfileDir) {
    args.push("--chrome-profile-dir", credentials.chromeProfileDir);
  }

  if (credentials.firefoxProfile) {
    args.push("--firefox-profile", credentials.firefoxProfile);
  }

  for (const source of credentials.cookieSource) {
    args.push("--cookie-source", source);
  }

  return args;
}

async function runBird(args: string[], credentials: BirdCredentials) {
  const runner = process.env.BIRD_RUNNER || "npx";
  const baseArgs = buildBirdBaseArgs(credentials);
  const runnerArgs =
    runner === "npx"
      ? ["-y", BIRD_PACKAGE, ...baseArgs, ...args]
      : [...baseArgs, ...args];

  try {
    const { stdout, stderr } = await execFileAsync(runner, runnerArgs, {
      timeout: 60_000,
      env: buildBirdEnv(credentials),
      maxBuffer: 8 * 1024 * 1024,
    });

    return `${stdout}\n${stderr}`.trim();
  } catch (error) {
    const stdout = error && typeof error === "object" && "stdout" in error
      ? String(error.stdout || "")
      : "";
    const stderr = error && typeof error === "object" && "stderr" in error
      ? String(error.stderr || "")
      : "";
    const message = [stdout, stderr, error instanceof Error ? error.message : String(error)]
      .filter(Boolean)
      .join("\n")
      .trim();
    throw new Error(redactBirdSecrets(message, credentials) || "Bird command failed");
  }
}

function redactBirdSecrets(message: string, credentials: BirdCredentials) {
  let redacted = message;
  for (const secret of [credentials.authToken, credentials.ct0]) {
    if (!secret) continue;
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted;
}

async function downloadBirdMedia(url: string) {
  const resolvedUrl = /^https?:\/\//i.test(url)
    ? url
    : new URL(url, getPublicAppUrlFromEnv()).toString();
  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch media: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const extension =
    contentType.includes("png")
      ? ".png"
      : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("gif")
          ? ".gif"
          : contentType.includes("mp4")
            ? ".mp4"
            : ".jpg";

  const dir = await mkdtemp(path.join(tmpdir(), "bird-publish-"));
  const filePath = path.join(dir, `media${extension}`);
  await writeFile(filePath, buffer);

  return {
    filePath,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function publishToBird(
  target: BirdPublishTarget
): Promise<PublishResult> {
  const credentials = resolveBirdCredentials(target.platform);

  const result = await publishToBirdWithCredentials(target, credentials);
  if (shouldRetryBirdWithInstalledSession(credentials, result.error)) {
    const installedSessionCredentials = {
      ...credentials,
      authToken: null,
      ct0: null,
    };
    const retryResult = await publishToBirdWithCredentials(
      target,
      installedSessionCredentials
    );
    if (retryResult.success) {
      return {
        ...retryResult,
        raw: {
          ...(typeof retryResult.raw === "object" && retryResult.raw !== null
            ? retryResult.raw
            : {}),
          credentialFallback: "installed_session",
        },
      };
    }

    return {
      ...retryResult,
      error: [
        result.error ?? "Bird CLI credential publish failed.",
        retryResult.error ?? "Bird installed-session retry failed.",
      ].join("; "),
    };
  }

  return result;
}

async function publishToBirdWithCredentials(
  target: BirdPublishTarget,
  credentials: BirdCredentials
): Promise<PublishResult> {
  const normalizedPlatform =
    target.platform.type === "x" ? "twitter" : target.platform.type;

  if (!["twitter", "x"].includes(target.platform.type)) {
    return {
      platform: normalizedPlatform,
      provider: "bird",
      accountId: target.platform.accountId,
      success: false,
      classification: "validation_error",
      error: "Bird publishing is only supported for X/Twitter right now.",
    };
  }

  const threadParts = resolveBirdThreadParts(
    target.content,
    credentials,
    target.threadLongPosts
  );

  let media: Array<Awaited<ReturnType<typeof downloadBirdMedia>>> = [];

  try {
    const mediaUrls = resolveBirdMediaUrls(target).slice(0, 4);
    if (mediaUrls.length > 0) {
      media = await Promise.all(mediaUrls.map((url) => downloadBirdMedia(url)));
    }

    const firstArgs = ["tweet", "--plain"];
    for (const item of media) {
      firstArgs.push("--media", item.filePath);
    }
    firstArgs.push(threadParts[0]);

    const firstOutput = await runBird(firstArgs, credentials);
    const firstUrl = extractBirdUrl(firstOutput);

    if (!firstUrl) {
      throw new Error(firstOutput || "Bird did not return a post URL.");
    }

    let lastUrl = firstUrl;
    for (let index = 1; index < threadParts.length; index += 1) {
      const output = await runBird(
        ["reply", "--plain", lastUrl, threadParts[index]],
        credentials
      );
      const replyUrl = extractBirdUrl(output);
      if (!replyUrl) {
        throw new Error(output || "Bird did not return a reply URL.");
      }
      lastUrl = replyUrl;
    }

    return {
      platform: normalizedPlatform,
      provider: "bird",
      accountId: target.platform.accountId,
      success: true,
      classification: "success",
      postId: extractBirdPostId(firstUrl),
      postUrl: firstUrl,
      raw: {
        threadParts: threadParts.length,
        finalUrl: lastUrl,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      platform: normalizedPlatform,
      provider: "bird",
      accountId: target.platform.accountId,
      success: false,
      classification: classifyBirdError(message),
      error: message,
    };
  } finally {
    await Promise.all(media.map((item) => item.cleanup()));
  }
}

function resolveBirdMediaUrls(target: BirdPublishTarget) {
  const urls = (target.mediaUrls ?? [])
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
  if (urls.length > 0) return urls;
  return target.mediaUrl ? [target.mediaUrl] : [];
}
