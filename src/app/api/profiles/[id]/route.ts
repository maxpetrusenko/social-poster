import { db } from "@/db";
import { profiles } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;

    const profile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
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
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

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
      await db.update(profiles).set({ isDefault: false });
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
      .where(eq(profiles.id, id));

    const updatedProfile = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, id))
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
