import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import { getRecoveredRunContext } from "@/lib/dashboard/recovered-run";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const context = await getRecoveredRunContext(id, tenant.currentWorkspace.id);
    const recoveredContent = context.details.content;

    if (context.run.postId) {
      return NextResponse.json({ id: context.run.postId, reused: true });
    }

    if (!recoveredContent) {
      return NextResponse.json(
        { error: "Run does not have recoverable content yet." },
        { status: 400 }
      );
    }

    const postId = crypto.randomUUID();
    const now = new Date();

    await db.insert(posts).values({
      id: postId,
      workspaceId: tenant.currentWorkspace.id,
      title: context.details.title || context.schedule?.name || "Recovered failed run",
      content: recoveredContent,
      contentType: context.details.contentType || "text",
      mediaUrl: context.details.mediaUrl || undefined,
      sourceUrl: context.details.sourceUrl || undefined,
      sourceTitle: context.details.title || undefined,
      profileId: context.schedule?.profileId ?? undefined,
      status: "draft",
      scheduledAt: undefined,
      publishedAt: undefined,
      dedupKey: undefined,
      metadata: {
        sourceRunId: context.run.id,
        sourceScheduleId: context.schedule?.id ?? null,
        recoveredFrom: "calendar_failed_run",
      },
      createdAt: now,
      updatedAt: now,
    });

    const platformIds = Array.from(new Set(context.schedule?.targetPlatformIds ?? []));
    if (platformIds.length > 0) {
      await db.insert(postTargets).values(
        platformIds.map((platformId) => ({
          id: crypto.randomUUID(),
          postId,
          platformId,
          status: "pending" as const,
          publishedUrl: null,
          platformPostId: null,
          error: null,
          publishedAt: null,
          createdAt: now,
        }))
      );
    }

    return NextResponse.json({ id: postId, reused: false });
  } catch (error) {
    console.error("POST /api/pipeline-runs/[id]/draft error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create draft" },
      { status: 500 }
    );
  }
}
