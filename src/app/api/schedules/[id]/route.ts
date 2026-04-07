import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const { id: scheduleId } = await params;

    // Fetch current schedule to only update provided fields
    const current = await db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
    });

    if (!current) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    const updates = {
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      cron: body.cron ?? current.cron,
      cronHuman: body.cronHuman ?? current.cronHuman,
      jobType: body.jobType ?? current.jobType,
      profileId: body.profileId ?? current.profileId,
      targetPlatformIds: body.targetPlatformIds ?? current.targetPlatformIds,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      updatedAt: new Date(),
    };

    const result = await db
      .update(schedules)
      .set(updates)
      .where(eq(schedules.id, scheduleId))
      .returning();

    return Response.json(result[0]);
  } catch (error) {
    console.error("POST /api/schedules/[id] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
