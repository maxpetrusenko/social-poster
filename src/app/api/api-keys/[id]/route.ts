import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenancy";

// DELETE /api/api-keys/[id] — revoke key
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenantContext();

  await db.update(apiKeys)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.workspaceId, ctx.currentWorkspace.id)));

  return NextResponse.json({ ok: true });
}
