import { db } from "@/db";
import { platforms, posts, postTargets, profiles } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import crypto from "node:crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      title,
      content,
      contentType,
      sourceUrl,
      scheduledAt,
      intent,
      profileId,
      platformIds,
      mediaUrl,
    } = body;

    if (!content) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, id), eq(posts.workspaceId, tenant.currentWorkspace.id)),
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const now = new Date();
    const normalizedIntent =
      intent === "schedule" || intent === "publish" ? intent : "draft";
    const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    if (normalizedIntent === "schedule") {
      if (!nextScheduledAt || Number.isNaN(nextScheduledAt.getTime())) {
        return NextResponse.json(
          { error: "A valid schedule time is required" },
          { status: 400 }
        );
      }

      if (nextScheduledAt <= now) {
        return NextResponse.json(
          { error: "Schedule time must be in the future" },
          { status: 400 }
        );
      }
    }

    const status = normalizedIntent === "schedule" ? "scheduled" : "draft";
    const normalizedProfileId =
      typeof profileId === "string" && profileId.trim() ? profileId.trim() : null;
    const normalizedPlatformIds = Array.isArray(platformIds)
      ? Array.from(new Set(platformIds.filter((value: unknown): value is string => typeof value === "string")))
      : null;

    if (normalizedProfileId) {
      const matchingProfile = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.id, normalizedProfileId),
            eq(profiles.workspaceId, tenant.currentWorkspace.id)
          )
        )
        .get();

      if (!matchingProfile) {
        return NextResponse.json(
          { error: "Selected profile is outside the current workspace." },
          { status: 400 }
        );
      }
    }

    if (normalizedPlatformIds && normalizedPlatformIds.length > 0) {
      const matchingPlatforms = await db
        .select({ id: platforms.id, workspaceId: platforms.workspaceId })
        .from(platforms)
        .where(inArray(platforms.id, normalizedPlatformIds));

      const allowedIds = new Set(
        matchingPlatforms
          .filter((platform) => platform.workspaceId === tenant.currentWorkspace.id)
          .map((platform) => platform.id)
      );

      if (allowedIds.size !== normalizedPlatformIds.length) {
        return NextResponse.json(
          { error: "One or more selected channels are outside the current workspace." },
          { status: 400 }
        );
      }
    }

    await db
      .update(posts)
      .set({
        title: title || null,
        content,
        contentType: contentType || "text",
        mediaUrl: mediaUrl || null,
        sourceUrl: sourceUrl || null,
        profileId: normalizedProfileId,
        status,
        scheduledAt: normalizedIntent === "schedule" ? nextScheduledAt : null,
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    if (normalizedPlatformIds !== null) {
      await db
        .delete(postTargets)
        .where(eq(postTargets.postId, id));

      if (normalizedPlatformIds.length > 0) {
        const targetEntries = normalizedPlatformIds.map((platformId: string) => ({
          id: crypto.randomUUID(),
          postId: id,
          platformId,
          status: "pending" as const,
          publishedUrl: null,
          platformPostId: null,
          error: null,
          publishedAt: null,
          createdAt: now,
        }));

        await db.insert(postTargets).values(targetEntries);
      }
    }

    return NextResponse.json({
      id,
      message: "Post updated successfully",
    });
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}
