import { db } from "@/db";
import { pipelineRuns, schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const { id: scheduleId } = await params;

    // Verify schedule exists
    const schedule = await db.query.schedules.findFirst({
      where: eq(schedules.id, scheduleId),
    });

    if (!schedule) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    const runId = crypto.randomUUID();
    const now = new Date();

    // Create a new pipeline run with trigger="manual" and status="running"
    const result = await db
      .insert(pipelineRuns)
      .values({
        id: runId,
        scheduleId,
        postId: null,
        trigger: "manual",
        status: "running",
        steps: [],
        startedAt: now,
      })
      .returning();

    // TODO: Wire up actual job execution (queue to worker, etc.)

    return Response.json(result[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/schedules/[id]/run error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
