import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;

    // Check if platform exists
    const platform = await db.query.platforms.findFirst({
      where: eq(platforms.id, id),
    });

    if (!platform) {
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
