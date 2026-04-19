import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
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

    const id = crypto.randomUUID();
    const now = new Date();

    // If this profile is set as default, unset other defaults
    if (isDefault) {
      await db
        .update(profiles)
        .set({ isDefault: false, updatedAt: now })
        .where(eq(profiles.workspaceId, tenant.currentWorkspace.id));
    }

    await db.insert(profiles).values({
      id,
      workspaceId: tenant.currentWorkspace.id,
      name,
      bio: bio || null,
      avatarUrl: avatarUrl || null,
      voiceId: voiceId || null,
      faceId: faceId || null,
      tone: tone || null,
      isDefault: isDefault || false,
      createdAt: now,
      updatedAt: now,
    });

    const newProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
      .then((rows) => rows[0]);

    return NextResponse.json(newProfile, { status: 201 });
  } catch (error) {
    console.error("Error creating profile:", error);
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 }
    );
  }
}
