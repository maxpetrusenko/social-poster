import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { DISCONNECTED_CONNECTION_FLAG } from "@/lib/platform-connection-state";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;

    // Check if platform exists
    const platform = await db.query.platforms.findFirst({
      where: eq(platforms.id, id),
    });

    if (!platform || platform.workspaceId !== tenant.currentWorkspace.id) {
      return NextResponse.json(
        { error: "Platform not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const { credentials: _credentials, ...safeConfig } = platform.config ?? {};
    void _credentials;

    await db
      .update(platforms)
      .set({
        enabled: false,
        config: {
          ...safeConfig,
          [DISCONNECTED_CONNECTION_FLAG]: now.toISOString(),
          disconnectedProvider: platform.provider,
        },
        updatedAt: now,
      })
      .where(eq(platforms.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete platform:", error);
    return NextResponse.json(
      { error: "Failed to delete platform" },
      { status: 500 }
    );
  }
}
