import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { runScheduleJob } from "@/lib/schedule-jobs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const { id: scheduleId } = await params;
    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
    });

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Fire job async (don't block the response)
    const jobPromise = runScheduleJob(schedule, "manual");

    jobPromise.catch((err) =>
      console.error(`[api] manual run failed for ${scheduleId}:`, err)
    );

    return Response.json({ message: "Job started", scheduleId, jobType: schedule.jobType }, { status: 202 });
  } catch (error) {
    console.error("POST /api/schedules/[id]/run error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
