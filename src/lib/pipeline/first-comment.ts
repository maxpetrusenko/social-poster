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
 * Automatic public source comments are disabled. Source URLs stay in internal
 * post metadata instead of public credit/source replies.
 */
export async function publishFirstComment(
  input: FirstCommentInput
): Promise<FirstCommentResult> {
  const { platform } = input;
  const platformType = platform.type.toLowerCase();
  return {
    platform: platformType,
    success: false,
    error: "Skipped: automatic public source comments are disabled.",
  };
}

/**
 * Public source-link footers are disabled. Source metadata is stored on the
 * post/run instead of appended to generated captions.
 */
export function appendSourceLink(
  content: string,
  _sourceUrl: string,
  _platformType: string
): string {
  void _sourceUrl;
  void _platformType;
  return content;
}
