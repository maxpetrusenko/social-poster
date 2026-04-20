import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { checkBirdPlatformSession } from "@/lib/replies/bird-session-health";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const reconnectSchema = z.object({
  authToken: z.string().min(1, "auth_token is required"),
  ct0: z.string().min(1, "ct0 is required"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  const platform = await db.query.platforms.findFirst({
    where: eq(platforms.id, id),
  });

  if (!platform || platform.workspaceId !== tenant.currentWorkspace.id) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  if (platform.provider !== "bird" || !["twitter", "x"].includes(platform.type)) {
    return NextResponse.json(
      { error: "Only X Bird connections support reconnect." },
      { status: 400 }
    );
  }

  let body: z.infer<typeof reconnectSchema>;
  try {
    body = reconnectSchema.parse(await request.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Provide both auth_token and ct0.", details: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const existingConfig = (platform.config ?? {}) as Record<string, unknown>;
  const existingCredentials =
    (existingConfig.credentials as Record<string, unknown>) ?? {};

  await db
    .update(platforms)
    .set({
      config: {
        ...existingConfig,
        credentials: {
          ...existingCredentials,
          X_AUTH_TOKEN: body.authToken,
          X_CT0: body.ct0,
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(platforms.id, id));

  const updated = await db.query.platforms.findFirst({
    where: eq(platforms.id, id),
  });

  if (!updated) {
    return NextResponse.json({ error: "Platform not found" }, { status: 404 });
  }

  const result = await checkBirdPlatformSession(updated);

  return NextResponse.json(
    {
      ok: result.status === "ok",
      result,
      message: result.message,
      error: result.error,
    },
    { status: result.status === "ok" ? 200 : 502 }
  );
}
