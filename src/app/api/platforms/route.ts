import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";

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
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const validated = createPlatformSchema.parse(body);

    const now = new Date();
    const id = crypto.randomUUID();

    await db.insert(platforms).values({
      id,
      name: validated.name,
      type: validated.type,
      handle: validated.handle || null,
      accountId: validated.accountId || null,
      provider: validated.provider,
      config: validated.config ?? null,
      enabled: validated.enabled,
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
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
