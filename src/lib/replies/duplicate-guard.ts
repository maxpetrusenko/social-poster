import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { replyEvents } from "@/db/schema";

export type ClaimReplySlotParams = {
  workspaceId?: string | null;
  runId?: string | null;
  scheduleId?: string | null;
  platformId?: string | null;
  tweetUrl: string;
  authorHandle: string;
  category?: string | null;
  lane: string;
  replyText: string;
  metadata?: Record<string, unknown> | null;
};

/**
 * Atomically claim a reply slot for a tweet URL by inserting a "pending" row.
 * If another caller already claimed it (unique constraint violation), returns null.
 * On success returns the event ID so the caller can update it after the API call.
 */
export async function claimReplySlot(
  db: Db,
  params: ClaimReplySlotParams
): Promise<string | null> {
  const eventId = crypto.randomUUID();
  try {
    await db.insert(replyEvents).values({
      id: eventId,
      workspaceId: params.workspaceId ?? null,
      runId: params.runId ?? null,
      scheduleId: params.scheduleId ?? null,
      platformId: params.platformId ?? null,
      tweetUrl: params.tweetUrl,
      replyUrl: null,
      authorHandle: params.authorHandle,
      category: params.category ?? null,
      lane: params.lane,
      replyText: params.replyText,
      status: "pending",
      error: null,
      metadata: params.metadata ?? null,
      createdAt: new Date(),
    });
    return eventId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("UNIQUE constraint failed") || message.includes("SQLITE_CONSTRAINT")) {
      return null;
    }
    throw error;
  }
}

/** Mark a claimed reply slot as successfully sent. */
export async function markReplySlotSent(
  db: Db,
  eventId: string,
  replyUrl: string | null
): Promise<void> {
  await db
    .update(replyEvents)
    .set({ status: "sent", replyUrl })
    .where(eq(replyEvents.id, eventId));
}

/** Mark a claimed reply slot as failed, freeing the tweet URL for retry. */
export async function markReplySlotFailed(
  db: Db,
  eventId: string,
  error: string
): Promise<void> {
  await db
    .update(replyEvents)
    .set({ status: "failed", error })
    .where(eq(replyEvents.id, eventId));
}

export function normalizeReplyText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isDuplicateReplyError(error?: string | null): boolean {
  if (!error) return false;

  const normalized = error.toLowerCase();
  return (
    normalized.includes("status is a duplicate") ||
    normalized.includes("failed to post reply: authorization: status is a duplicate") ||
    normalized.includes("(187)") ||
    normalized.includes("duplicate")
  );
}

export function uniqueReplyDrafts(drafts: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const draft of drafts) {
    const normalized = normalizeReplyText(draft);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(draft.trim().replace(/\s+/g, " "));
  }

  return unique;
}

export function filterUntriedReplyDrafts(
  drafts: string[],
  attemptedTexts: Iterable<string>
): string[] {
  const attempted = new Set<string>();

  for (const text of attemptedTexts) {
    const normalized = normalizeReplyText(text);
    if (normalized) attempted.add(normalized);
  }

  return uniqueReplyDrafts(drafts).filter((draft) => !attempted.has(normalizeReplyText(draft)));
}
