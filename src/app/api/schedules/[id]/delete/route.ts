import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import { eq } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const { id: scheduleId } = await params;

    const result = await db.delete(schedules).where(eq(schedules.id, scheduleId)).returning();

    if (result.length === 0) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    await reconcileSchedules("schedule:delete");

    return Response.json({ success: true });
  } catch (error) {
    console.error("POST /api/schedules/[id]/delete error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
