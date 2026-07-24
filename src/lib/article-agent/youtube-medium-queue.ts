import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export type YouTubeMediumQueueStatus =
  | "posted"
  | "needs_review"
  | "generated_not_posted"
  | "missing_article"
  | "posted_not_in_current_playlist";

export type YouTubeMediumQueueItem = {
  position?: number;
  videoId: string;
  title: string;
  channel?: string;
  sourceUrl?: string;
  status: YouTubeMediumQueueStatus;
  statusLabel: string;
  needsApproval?: boolean;
  articleTitle?: string | null;
  articleSlug?: string | null;
  articlePackagePath?: string | null;
  articleFilePath?: string | null;
  dashboardUrl?: string | null;
  publicPreviewUrl?: string | null;
  mediumUrl?: string | null;
  mediumPublishedAt?: string | null;
  rating?: number | null;
  ratingTarget?: number | null;
  nextAction?: string;
  proof?: string[];
};

export type YouTubeMediumQueueSnapshot = {
  generatedAt: string;
  playlistUrl: string;
  playlistId: string;
  playlistTitle: string;
  mediumRssUrl: string;
  summary: {
    totalCurrentPlaylist: number;
    posted: number;
    needsApproval: number;
    missingArticle: number;
    generatedNotPosted: number;
    historicalPostedNotInPlaylist: number;
  };
  items: YouTubeMediumQueueItem[];
  historical: YouTubeMediumQueueItem[];
};

export async function getYouTubeMediumQueueSnapshot(): Promise<YouTubeMediumQueueSnapshot | null> {
  const workspaceRoot = process.env.ARTICLE_WORKSPACE_DIR || path.join(process.cwd(), "data", "article-workspace");
  const snapshotPath = path.join(workspaceRoot, "youtube-medium-playlist-queue.json");
  try {
    return JSON.parse(await readFile(snapshotPath, "utf8")) as YouTubeMediumQueueSnapshot;
  } catch {
    return null;
  }
}
