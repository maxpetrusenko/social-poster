import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import crypto from "node:crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

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
      where: eq(posts.id, id),
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

    await db
      .update(posts)
      .set({
        title: title || null,
        content,
        contentType: contentType || "text",
        mediaUrl: mediaUrl || null,
        sourceUrl: sourceUrl || null,
        profileId: profileId || null,
        status,
        scheduledAt: normalizedIntent === "schedule" ? nextScheduledAt : null,
        updatedAt: now,
      })
      .where(eq(posts.id, id));

    if (platformIds) {
      await db
        .delete(postTargets)
        .where(eq(postTargets.postId, id));

      if (platformIds.length > 0) {
        const targetEntries = platformIds.map((platformId: string) => ({
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
