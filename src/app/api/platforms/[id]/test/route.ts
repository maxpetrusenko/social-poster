import { db } from "@/db";
import { platforms } from "@/db/schema";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { checkBirdPlatformSession } from "@/lib/replies/bird-session-health";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST(
  _request: Request,
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
      { error: "Only X Bird connections can be checked here." },
      { status: 400 }
    );
  }

  const result = await checkBirdPlatformSession(platform);

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
