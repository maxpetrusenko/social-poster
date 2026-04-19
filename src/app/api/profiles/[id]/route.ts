import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { requireApiSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
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

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Error fetching profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

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
      name,
      bio,
      avatarUrl,
      voiceId,
      faceId,
      tone,
      isDefault,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // If this profile is set as default, unset other defaults
    if (isDefault) {
      await db
        .update(profiles)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(profiles.workspaceId, tenant.currentWorkspace.id));
    }

    const now = new Date();

    await db
      .update(profiles)
      .set({
        name,
        bio: bio || null,
        avatarUrl: avatarUrl || null,
        voiceId: voiceId || null,
        faceId: faceId || null,
        tone: tone || null,
        isDefault: isDefault || false,
        updatedAt: now,
      })
      .where(and(eq(profiles.id, id), eq(profiles.workspaceId, tenant.currentWorkspace.id)));

    const updatedProfile = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, id), eq(profiles.workspaceId, tenant.currentWorkspace.id)))
      .then((rows) => rows[0]);

    if (!updatedProfile) {
      return NextResponse.json(
        { error: "Profile not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedProfile);
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
