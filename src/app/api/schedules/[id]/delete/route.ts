import { db } from "@/db";
import { schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import { and, eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: scheduleId } = await params;

    const result = await db
      .delete(schedules)
      .where(
        and(
          eq(schedules.id, scheduleId),
          eq(schedules.workspaceId, tenant.currentWorkspace.id)
        )
      )
      .returning();

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
