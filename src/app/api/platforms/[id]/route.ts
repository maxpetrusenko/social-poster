import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManagerWrite } from "@/lib/api-authorization";
import {
  findPlatformByExternalAccount,
  type PlatformProvider,
} from "@/lib/platform-connections";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
  const tenant = await requireApiWorkspaceManagerWrite();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updatePlatformSchema.parse(body);

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

    const nextType = (validated.type ?? platform.type) as PlatformType;
    const nextProvider = (validated.provider ??
      platform.provider) as PlatformProvider;
    const nextAccountId =
      validated.accountId !== undefined ? validated.accountId : platform.accountId;
    const duplicate = await findPlatformByExternalAccount({
      workspaceId: tenant.currentWorkspace.id,
      provider: nextProvider,
      type: nextType,
      accountId: nextAccountId,
      excludeId: id,
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "This account is already connected." },
        { status: 409 }
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

const patchPlatformSchema = z.object({ enabled: z.boolean() }).strict();

// PATCH /api/platforms/[id] { enabled } — toggle a platform on/off.
// Session or read_write API key; scoped to the caller's workspace.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceManagerWrite();
  if (tenant instanceof NextResponse) return tenant;

  let body: z.infer<typeof patchPlatformSchema>;
  try {
    body = patchPlatformSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Validation failed", details: error instanceof z.ZodError ? error.issues : undefined },
      { status: 400 }
    );
  }

  const { id } = await params;
  const platform = await db.query.platforms.findFirst({
    where: and(eq(platforms.id, id), eq(platforms.workspaceId, tenant.currentWorkspace.id)),
  });
  if (!platform) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  await db
    .update(platforms)
    .set({ enabled: body.enabled, updatedAt: new Date() })
    .where(and(eq(platforms.id, id), eq(platforms.workspaceId, tenant.currentWorkspace.id)));

  return NextResponse.json({ success: true, id, enabled: body.enabled });
}
