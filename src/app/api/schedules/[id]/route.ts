import { db } from "@/db";
import { platforms, profiles, schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import { and, eq, inArray } from "drizzle-orm";
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

    const body = await request.json();
    const { id: scheduleId } = await params;

    // Fetch current schedule to only update provided fields
    const current = await db.query.schedules.findFirst({
      where: and(
        eq(schedules.id, scheduleId),
        eq(schedules.workspaceId, tenant.currentWorkspace.id)
      ),
    });

    if (!current) {
      return Response.json({ error: "Schedule not found" }, { status: 404 });
    }

    const normalizedProfileId =
      typeof body.profileId === "string" && body.profileId.trim()
        ? body.profileId.trim()
        : current.profileId ?? null;

    const normalizedPlatformIds: string[] | null = Array.isArray(body.targetPlatformIds)
      ? Array.from(
          new Set(
            body.targetPlatformIds.filter((value: unknown): value is string => typeof value === "string")
          )
        )
      : current.targetPlatformIds ?? null;

    if (normalizedProfileId) {
      const matchingProfile = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(
          and(
            eq(profiles.id, normalizedProfileId),
            eq(profiles.workspaceId, tenant.currentWorkspace.id)
          )
        )
        .get();

      if (!matchingProfile) {
        return Response.json(
          { error: "Selected profile is outside the current workspace." },
          { status: 400 }
        );
      }
    }

    if (normalizedPlatformIds && normalizedPlatformIds.length > 0) {
      const matchingPlatforms = await db
        .select({ id: platforms.id, workspaceId: platforms.workspaceId })
        .from(platforms)
        .where(inArray(platforms.id, normalizedPlatformIds));

      const allowedIds = new Set(
        matchingPlatforms
          .filter((platform) => platform.workspaceId === tenant.currentWorkspace.id)
          .map((platform) => platform.id)
      );

      if (allowedIds.size !== normalizedPlatformIds.length) {
        return Response.json(
          { error: "One or more selected channels are outside the current workspace." },
          { status: 400 }
        );
      }
    }

    const updates = {
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      cron: body.cron ?? current.cron,
      cronHuman: body.cronHuman ?? current.cronHuman,
      jobType: body.jobType ?? current.jobType,
      profileId: normalizedProfileId,
      targetPlatformIds: normalizedPlatformIds,
      config: body.config ?? current.config,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      updatedAt: new Date(),
    };

    const result = await db
      .update(schedules)
      .set(updates)
      .where(eq(schedules.id, scheduleId))
      .returning();

    await reconcileSchedules("schedule:update");

    return Response.json(result[0]);
  } catch (error) {
    console.error("POST /api/schedules/[id] error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
