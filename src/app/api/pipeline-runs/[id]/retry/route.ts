import crypto from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { pipelineRuns, type PipelineStep } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { getRecoveredRunContext } from "@/lib/dashboard/recovered-run";
import { publishPlatformTargets } from "@/lib/pipeline/publish-service";
import { resolvePublishResultsStatus } from "@/lib/pipeline/status";
import { getTenantContext } from "@/lib/tenancy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const context = await getRecoveredRunContext(id, tenant.currentWorkspace.id);
    const startedAt = new Date();
    const runId = crypto.randomUUID();
    const steps: PipelineStep[] = [];

    await db.insert(pipelineRuns).values({
      id: runId,
      workspaceId: tenant.currentWorkspace.id,
      scheduleId: context.schedule?.id ?? context.run.scheduleId ?? null,
      postId: null,
      trigger: "api",
      status: "running",
      steps: [],
      startedAt,
    });

    steps.push({
      name: "content:load",
      status: "completed",
      startedAt: startedAt.toISOString(),
      completedAt: startedAt.toISOString(),
      output: {
        title: context.details.title,
        summary: context.details.summary,
        link: context.details.sourceUrl,
        contentByPlatform: Object.fromEntries(
          context.recoveredTargets.map((target) => [target.platform.type, target.content])
        ),
        mediaUrlByPlatform: Object.fromEntries(
          context.recoveredTargets.map((target) => [target.platform.type, target.mediaUrl ?? null])
        ),
        instagramContentTypeByPlatform: Object.fromEntries(
          context.recoveredTargets
            .filter((target) => target.instagramContentType)
            .map((target) => [target.platform.type, target.instagramContentType])
        ),
      },
    });

    const captionStepStartedAt = new Date();
    steps.push({
      name: "caption:write",
      status: "completed",
      startedAt: captionStepStartedAt.toISOString(),
      completedAt: captionStepStartedAt.toISOString(),
      output: {
        captions: context.recoveredTargets.map((target) => ({
          platform: target.platform.type,
          chars: target.content.length,
          content: target.content,
          mediaUrl: target.mediaUrl ?? null,
          mediaType: target.mediaType ?? null,
          instagramContentType: target.instagramContentType ?? null,
        })),
      },
    });

    const publishStepStartedAt = new Date();
    const summary = await publishPlatformTargets(context.recoveredTargets);
    const publishEndedAt = new Date();
    const results = summary.outcomes;
    const failed = results.filter(
      (result) => !result.success && result.classification !== "disabled"
    );
    const skipped = results.filter((result) => result.classification === "disabled");

    steps.push({
      name: "publish",
      status: failed.length > 0 ? "failed" : skipped.length > 0 ? "skipped" : "completed",
      startedAt: publishStepStartedAt.toISOString(),
      completedAt: publishEndedAt.toISOString(),
      durationMs: publishEndedAt.getTime() - publishStepStartedAt.getTime(),
      output: {
        outcomes: results,
        published: summary.published,
        errors: summary.errors,
      },
      error: failed.length > 0 ? failed.map((result) => `${result.platform}: ${result.error}`).join("; ") : undefined,
    });

    const completedAt = new Date();
    const runStatus = resolvePublishResultsStatus(results);

    await db.update(pipelineRuns).set({
      status: runStatus,
      steps,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      completedAt,
      error: failed.length > 0 ? failed.map((result) => `${result.platform}: ${result.error}`).join("; ") : null,
    }).where(eq(pipelineRuns.id, runId));

    return NextResponse.json({ runId, success: runStatus === "completed" });
  } catch (error) {
    console.error("POST /api/pipeline-runs/[id]/retry error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to retry run" },
      { status: 500 }
    );
  }
}
