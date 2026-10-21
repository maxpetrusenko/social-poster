import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms } from "@/db/schema";
import {
  CONNECTION_ISSUE_KEY,
  readConnectionIssue,
  resolveAuthFailureStatus,
  type AuthFailureInput,
  type ConnectionIssueStatus,
} from "@/lib/platform-connection-state";

/** Persist an observed auth failure so GET /api/platforms reports the real status. */
export async function markPlatformAuthFailure(
  platformId: string,
  status: ConnectionIssueStatus,
  reason: string,
  now: Date = new Date()
) {
  try {
    const row = await db.query.platforms.findFirst({
      where: eq(platforms.id, platformId),
    });
    if (!row) return;
    const existing = readConnectionIssue(row.config);
    if (existing?.status === status && existing.reason === reason.slice(0, 300)) return;
    await db
      .update(platforms)
      .set({
        config: {
          ...(row.config ?? {}),
          [CONNECTION_ISSUE_KEY]: { status, reason: reason.slice(0, 300), at: now.toISOString() },
        },
        updatedAt: now,
      })
      .where(eq(platforms.id, platformId));
  } catch (error) {
    console.error("Failed to record platform auth failure:", error);
  }
}

/** Remove a recorded auth failure after a successful publish or token refresh. */
export async function clearPlatformAuthFailure(platformId: string) {
  try {
    const row = await db.query.platforms.findFirst({
      where: eq(platforms.id, platformId),
    });
    if (!row || !readConnectionIssue(row.config)) return;
    const next = { ...(row.config ?? {}) };
    delete next[CONNECTION_ISSUE_KEY];
    await db
      .update(platforms)
      .set({ config: next, updatedAt: new Date() })
      .where(eq(platforms.id, platformId));
  } catch (error) {
    console.error("Failed to clear platform auth failure:", error);
  }
}

/** Record a publish/refresh outcome when it indicates dead credentials. Returns the status written. */
export async function recordAuthFailureFromError(
  platformId: string,
  input: AuthFailureInput
): Promise<ConnectionIssueStatus | null> {
  const status = resolveAuthFailureStatus(input);
  if (!status) return null;
  await markPlatformAuthFailure(platformId, status, input.message ?? "Authentication failed");
  return status;
}
