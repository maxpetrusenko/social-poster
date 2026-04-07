import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import crypto from "node:crypto";

export async function POST(request: NextRequest) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const {
      title,
      content,
      contentType,
      sourceUrl,
      scheduledAt,
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

    const postId = crypto.randomUUID();
    const now = new Date();

    const status =
      scheduledAt && new Date(scheduledAt) > now ? "scheduled" : "draft";

    await db.insert(posts).values({
      id: postId,
      title: title || null,
      content,
      contentType: contentType || "text",
      mediaUrl: mediaUrl || null,
      sourceUrl: sourceUrl || null,
      sourceTitle: null,
      profileId: profileId || null,
      status,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      publishedAt: null,
      dedupKey: null,
      metadata: null,
      createdAt: now,
      updatedAt: now,
    });

    if (platformIds && platformIds.length > 0) {
      const targetEntries = platformIds.map((platformId: string) => ({
        id: crypto.randomUUID(),
        postId,
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

    return NextResponse.json(
      {
        id: postId,
        message: "Post created successfully",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating post:", error);
    return NextResponse.json(
      { error: "Failed to create post" },
      { status: 500 }
    );
  }
}
