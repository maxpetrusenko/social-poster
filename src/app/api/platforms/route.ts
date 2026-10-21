import { db } from "@/db";
import { platforms } from "@/db/schema";
import {
  requireApiWorkspaceManager,
  requireApiWorkspaceManagerRead,
} from "@/lib/api-authorization";
import { resolveConnectionStatus } from "@/lib/platform-connection-state";
import { readTokenExpiresAt } from "@/lib/providers/credentials";
import { asc, eq } from "drizzle-orm";
import { upsertPlatformConnection } from "@/lib/platform-connections";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const createPlatformSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(PLATFORM_TYPES),
  handle: z.string().optional(),
  accountId: z.string().optional(),
  provider: z.enum(["zernio", "bird", "direct"]).default("zernio"),
  config: z.record(z.string(), z.unknown()).nullable().optional(),
  enabled: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json();
    const validated = createPlatformSchema.parse(body);

    const now = new Date();
    const result = await upsertPlatformConnection({
      workspaceId: tenant.currentWorkspace.id,
      name: validated.name,
      type: validated.type,
      handle: validated.handle || null,
      accountId: validated.accountId || null,
      provider: validated.provider,
      config: validated.config ?? null,
      enabled: validated.enabled,
      now,
    });

    return NextResponse.json(
      { success: true, id: result.id, created: result.created },
      { status: result.created ? 201 : 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }

    console.error("Failed to create platform:", error);
    return NextResponse.json(
      { error: "Failed to create platform" },
      { status: 500 }
    );
  }
}

// GET /api/platforms — list this workspace's connections (safe fields only; never credentials).
export async function GET() {
  const tenant = await requireApiWorkspaceManagerRead();
  if (tenant instanceof NextResponse) return tenant;

  const rows = await db
    .select()
    .from(platforms)
    .where(eq(platforms.workspaceId, tenant.currentWorkspace.id))
    .orderBy(asc(platforms.createdAt));

  return NextResponse.json({
    platforms: rows.map((row) => {
      const expiresAt = readTokenExpiresAt(row.config);
      return {
        id: row.id,
        type: row.type,
        provider: row.provider,
        displayName: row.name,
        username: row.handle,
        enabled: row.enabled,
        connectionStatus: resolveConnectionStatus(row.config, expiresAt),
        tokenExpiresAt: expiresAt !== null ? new Date(expiresAt).toISOString() : null,
      };
    }),
  });
}
