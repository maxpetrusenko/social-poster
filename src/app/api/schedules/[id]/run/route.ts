import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiWorkspacePublisher } from "@/lib/api-authorization";
import { and, eq } from "drizzle-orm";
import { runScheduleJob } from "@/lib/schedule-jobs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspacePublisher();
  if (tenant instanceof Response) return tenant;

  try {
    const { id: scheduleId } = await params;
    const schedule = await db.query.schedules.findFirst({
      where: and(
        eq(schedules.id, scheduleId),
        eq(schedules.workspaceId, tenant.currentWorkspace.id)
      ),
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
