import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { pipelineRuns } from "@/db/schema";
import { ABANDONED_RUN_ERROR, finalizeAbandonedSteps } from "./recovery";
import { markInterruptedPublishTargets } from "./publish-claim";

/**
 * Fail runs left `running` by a previous process. For publish runs, also stamp
 * their still-`publishing` targets as unknown-delivery (never auto-retried).
 * Targets are marked before the run is failed, so a crash in between is
 * re-recovered on the next boot.
 */
export async function recoverAbandonedRuns(): Promise<void> {
  const runningRuns = await db.select().from(pipelineRuns).where(eq(pipelineRuns.status, "running"));
  if (runningRuns.length === 0) return;

  console.warn(`[scheduler] recovering ${runningRuns.length} abandoned run(s)`);

  for (const run of runningRuns) {
    if (run.postId) {
      const marked = markInterruptedPublishTargets(run.postId);
      if (marked > 0) {
        console.warn(
          `[scheduler] post ${run.postId}: ${marked} publishing target(s) marked unknown-delivery after restart`
        );
      }
    }
    await db
      .update(pipelineRuns)
      .set({
        status: "failed",
        error: ABANDONED_RUN_ERROR,
        steps: finalizeAbandonedSteps(run.steps, ABANDONED_RUN_ERROR),
        completedAt: new Date(),
        durationMs: Math.max(0, Date.now() - new Date(run.startedAt).getTime()),
      })
      .where(eq(pipelineRuns.id, run.id));
  }
}
