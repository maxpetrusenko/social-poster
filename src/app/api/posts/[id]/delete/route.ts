import { db } from "@/db";
import { platforms, posts, postTargets } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;

    const post = await db.query.posts.findFirst({
      where: and(eq(posts.id, id), eq(posts.workspaceId, tenant.currentWorkspace.id)),
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const targets = await db
      .select({ target: postTargets, platform: platforms })
      .from(postTargets)
      .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
      .where(eq(postTargets.postId, id));

    await recordTenantAuditEvent(tenant, {
      action: "post.delete",
      targetType: "post",
      targetId: id,
      metadata: {
        status: "deleted",
        endpoint: `POST /api/posts/${id}/delete`,
        href: "/dashboard/posts",
        title: post.title,
        contentPreview: post.content.slice(0, 120),
        platformTargetCount: targets.length,
        platforms: targets.map((entry) => entry.platform.name || entry.platform.type),
      },
    });

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
