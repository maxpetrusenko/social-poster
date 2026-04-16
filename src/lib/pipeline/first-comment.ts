import type { PublishResult } from "./publisher";
import type { platforms } from "@/db/schema";

type PlatformRow = typeof platforms.$inferSelect;

export type FirstCommentInput = {
  platform: PlatformRow;
  publishResult: PublishResult;
  sourceUrl: string;
  sourceTitle?: string;
};

export type FirstCommentResult = {
  platform: string;
  success: boolean;
  commentUrl?: string;
  error?: string;
};

/**
 * Post a first comment on a successfully published post.
 * - X/Twitter: uses Bird CLI reply
 * - Other platforms: logged as unsupported (getlate.dev doesn't expose comment APIs)
 */
export async function publishFirstComment(
  input: FirstCommentInput
): Promise<FirstCommentResult> {
  const { platform, publishResult, sourceUrl, sourceTitle } = input;
  const platformType = platform.type.toLowerCase();

  if (!publishResult.success || !publishResult.postUrl) {
    return {
      platform: platformType,
      success: false,
      error: "Skipped: parent post was not published successfully.",
    };
  }

  if (platformType === "x" || platformType === "twitter") {
    return publishBirdReply(platform, publishResult.postUrl, sourceUrl, sourceTitle);
  }

  // Other platforms: no comment API available via getlate.dev / Zernio
  console.log(
    `[first-comment] ${platformType}: comment API not available, skipping. Source: ${sourceUrl}`
  );
  return {
    platform: platformType,
    success: false,
    error: `Comment API not available for ${platformType}. Source link should be appended to post content instead.`,
  };
}

async function publishBirdReply(
  platform: PlatformRow,
  postUrl: string,
  sourceUrl: string,
  sourceTitle?: string
): Promise<FirstCommentResult> {
  try {
    const { resolveBirdCredentials } = await import("./bird-publisher");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);

    const credentials = resolveBirdCredentials(platform);
    const BIRD_PACKAGE = "@steipete/bird";
    const runner = process.env.BIRD_RUNNER || "npx";

    const commentText = sourceTitle
      ? `Source: ${sourceTitle}\n${sourceUrl}`
      : `Source: ${sourceUrl}`;

    const baseArgs: string[] = [];

    if (credentials.chromeProfile) {
      baseArgs.push("--chrome-profile", credentials.chromeProfile);
    }
    if (credentials.chromeProfileDir) {
      baseArgs.push("--chrome-profile-dir", credentials.chromeProfileDir);
    }
    if (credentials.firefoxProfile) {
      baseArgs.push("--firefox-profile", credentials.firefoxProfile);
    }
    for (const source of credentials.cookieSource) {
      baseArgs.push("--cookie-source", source);
    }

    const args =
      runner === "npx"
        ? ["-y", BIRD_PACKAGE, ...baseArgs, "reply", "--plain", postUrl, commentText]
        : [...baseArgs, "reply", "--plain", postUrl, commentText];

    const { buildBirdEnv } = await import("./bird-publisher-core");

    const { stdout, stderr } = await execFileAsync(runner, args, {
      timeout: 60_000,
      env: buildBirdEnv(credentials),
      maxBuffer: 8 * 1024 * 1024,
    });

    const output = `${stdout}\n${stderr}`.trim();
    const urlMatch = output.match(/https:\/\/x\.com\/[^\s]+/);
    const commentUrl = urlMatch ? urlMatch[0] : undefined;

    console.log(
      `[first-comment] X reply posted: ${commentUrl ?? "no URL returned"}`
    );

    return {
      platform: "twitter",
      success: true,
      commentUrl,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[first-comment] X reply failed: ${message}`);
    return {
      platform: "twitter",
      success: false,
      error: message,
    };
  }
}

/**
 * For platforms without comment API support, append the source link
 * to the post content before publishing.
 */
export function appendSourceLink(
  content: string,
  sourceUrl: string,
  platformType: string
): string {
  if (!sourceUrl) return content;

  if (platformType === "x" || platformType === "twitter") {
    // Don't append on X — link goes in first comment
    return content;
  }

  // LinkedIn and others: append source link
  return `${content}\n\nSource: ${sourceUrl}`;
}
