import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";
import { NextRequest, NextResponse } from "next/server";

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

    // Check if profile exists
    const profile = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.workspaceId, tenant.currentWorkspace.id)))
      .then((rows) => rows[0]);

    if (!profile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    // Delete the profile
    await db
      .delete(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.workspaceId, tenant.currentWorkspace.id)));

    return NextResponse.json(
      { message: "Profile deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting profile:", error);
    return NextResponse.json(
      { error: "Failed to delete profile" },
      { status: 500 }
    );
  }
}
