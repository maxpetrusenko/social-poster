import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantContext } from "@/lib/tenancy";

const updatePlatformSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  type: z.enum(PLATFORM_TYPES).optional(),
  handle: z.string().optional(),
  accountId: z.string().optional(),
  provider: z.enum(["zernio", "bird", "direct"]).optional(),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updatePlatformSchema.parse(body);
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

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.handle !== undefined)
      updateData.handle = validated.handle || null;
    if (validated.accountId !== undefined)
      updateData.accountId = validated.accountId || null;
    if (validated.provider !== undefined) updateData.provider = validated.provider;
    if (validated.config !== undefined) updateData.config = validated.config;
    if (validated.enabled !== undefined) updateData.enabled = validated.enabled;

    await db
      .update(platforms)
      .set(updateData)
      .where(eq(platforms.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to update platform:", error);
    return NextResponse.json(
      { error: "Failed to update platform" },
      { status: 500 }
    );
  }
}
