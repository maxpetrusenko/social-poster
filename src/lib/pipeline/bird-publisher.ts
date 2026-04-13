import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { platforms } from "@/db/schema";
import { readStoredConnectionConfig } from "@/lib/connection-config";

import type { PublishResult } from "./publisher";
import {
  classifyBirdError,
  resolveBirdCredentialsFromSource,
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
};

export function resolveBirdCredentials(
  platform: Pick<PlatformRow, "config" | "provider" | "type">
): BirdCredentials {
  const stored = readStoredConnectionConfig(platform.config);
  return resolveBirdCredentialsFromSource(stored.credentials ?? {});
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

  if (credentials.authToken && credentials.ct0) {
    args.push("--auth-token", credentials.authToken, "--ct0", credentials.ct0);
  } else if (!credentials.useInstalledBirdSession) {
    throw new Error(
      "Missing Bird auth credentials. Add authToken and ct0 or enable installed Bird session."
    );
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
      env: process.env,
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
    throw new Error(message || "Bird command failed");
  }
}

async function downloadBirdMedia(url: string) {
  const resolvedUrl = /^https?:\/\//i.test(url)
    ? url
    : new URL(url, process.env.APP_URL?.trim() || "http://localhost:3000").toString();
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

  const threadParts =
    credentials.threadLongPosts && target.content.length > credentials.tweetCharLimit
      ? splitBirdThreadContent(target.content, credentials.threadChunkLimit)
      : [target.content.trim()];

  let media: Awaited<ReturnType<typeof downloadBirdMedia>> | null = null;

  try {
    if (target.mediaUrl) {
      media = await downloadBirdMedia(target.mediaUrl);
    }

    const firstArgs = ["tweet", "--plain"];
    if (media) {
      firstArgs.push("--media", media.filePath);
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
    await media?.cleanup();
  }
}
