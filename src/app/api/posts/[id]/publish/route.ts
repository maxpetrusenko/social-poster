import { db } from "@/db";
import { posts, postTargets, platforms, pipelineRuns } from "@/db/schema";
import type { PipelineStep } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { publishToZernio } from "@/lib/publish/zernio";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const { id: postId } = await params;
  const post = await db.query.posts.findFirst({ where: eq(posts.id, postId) });
  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const targets = db
    .select({ target: postTargets, platform: platforms })
    .from(postTargets)
    .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
    .where(eq(postTargets.postId, postId))
    .all();

  if (targets.length === 0) {
    return NextResponse.json({ error: "No platform targets for this post" }, { status: 400 });
  }

  // Create pipeline run
  const runId = crypto.randomUUID();
  const now = new Date();
  const steps: PipelineStep[] = [];

  await db.insert(pipelineRuns).values({
    id: runId,
    scheduleId: null,
    postId,
    trigger: "api",
    status: "running",
    steps: [],
    startedAt: now,
  });

  // Update post status
  await db.update(posts).set({ status: "publishing", updatedAt: now }).where(eq(posts.id, postId));

  let allSuccess = true;

  for (const { target, platform } of targets) {
    const stepName = `publish:${platform.type}`;
    const stepStart = new Date();

    const result = await publishToZernio({
      platform: platform.type,
      content: post.content,
      mediaUrl: post.mediaUrl,
    });

    const stepEnd = new Date();
    const step: PipelineStep = {
      name: stepName,
      status: result.success ? "completed" : "failed",
      startedAt: stepStart.toISOString(),
      completedAt: stepEnd.toISOString(),
      durationMs: stepEnd.getTime() - stepStart.getTime(),
      output: result,
      error: result.error,
    };
    steps.push(step);

    // Update target status
    await db.update(postTargets).set({
      status: result.success ? "published" : "failed",
      publishedUrl: result.postUrl ?? null,
      platformPostId: result.postId ?? null,
      error: result.error ?? null,
      publishedAt: result.success ? stepEnd : null,
    }).where(eq(postTargets.id, target.id));

    if (!result.success) allSuccess = false;
  }

  const completedAt = new Date();

  // Update pipeline run
  await db.update(pipelineRuns).set({
    status: allSuccess ? "completed" : "failed",
    steps,
    durationMs: completedAt.getTime() - now.getTime(),
    completedAt,
  }).where(eq(pipelineRuns.id, runId));

  // Update post status
  await db.update(posts).set({
    status: allSuccess ? "published" : "failed",
    publishedAt: allSuccess ? completedAt : null,
    updatedAt: completedAt,
  }).where(eq(posts.id, postId));

  return NextResponse.json({ runId, steps, success: allSuccess });
}
