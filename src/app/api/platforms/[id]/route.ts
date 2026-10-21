import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManagerWrite } from "@/lib/api-authorization";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
