import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenancy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const tenant = await getTenantContext();
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

    await db.delete(platforms).where(eq(platforms.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete platform:", error);
    return NextResponse.json(
      { error: "Failed to delete platform" },
      { status: 500 }
    );
  }
}
