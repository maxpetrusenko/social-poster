import { db } from "@/db";
import { posts, postTargets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getTenantContext } from "@/lib/tenancy";

export async function POST(
  request: NextRequest,
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

    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, id), eq(posts.workspaceId, tenant.currentWorkspace.id)),
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    await db.delete(postTargets).where(eq(postTargets.postId, id));

    await db.delete(posts).where(eq(posts.id, id));

    return NextResponse.json({
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}
