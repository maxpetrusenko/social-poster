import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import crypto from "node:crypto";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const { name, description, cron, cronHuman, jobType, profileId, targetPlatformIds, enabled, config } = body;

    if (!name || !cron || !jobType) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date();

    const result = await db
      .insert(schedules)
      .values({
        id,
        name,
        description: description || null,
        cron,
        cronHuman: cronHuman || null,
        jobType,
        profileId: profileId || null,
        targetPlatformIds: targetPlatformIds || [],
        config: config || null,
        enabled: enabled !== false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await reconcileSchedules("schedule:create");

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/schedules error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
