import { db } from "@/db";
import { platforms, profiles, schedules } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import { hydrateScheduleConfigMedia } from "@/lib/schedule-media";
import { reconcileSchedules } from "@/lib/scheduler";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  try {
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

    const hydratedConfig = await hydrateScheduleConfigMedia(
      body.config ?? current.config,
      {
        workspaceId: tenant.currentWorkspace.id,
        scheduleId,
        strict: true,
      }
    );

    const updates = {
      name: body.name ?? current.name,
      description: body.description ?? current.description,
      cron: body.cron ?? current.cron,
      cronHuman: body.cronHuman ?? current.cronHuman,
      jobType: body.jobType ?? current.jobType,
      profileId: normalizedProfileId,
      targetPlatformIds: normalizedPlatformIds,
      config: hydratedConfig,
      enabled: body.enabled !== undefined ? body.enabled : current.enabled,
      updatedAt: new Date(),
    };

    const result = await db
      .update(schedules)
      .set(updates)
      .where(eq(schedules.id, scheduleId))
      .returning();

    await reconcileSchedules("schedule:update");

    await recordTenantAuditEvent(tenant, {
      action: "schedule.update",
      targetType: "schedule",
      targetId: scheduleId,
      metadata: {
        status: updates.enabled ? "scheduled" : "paused",
        endpoint: `POST /api/schedules/${scheduleId}`,
        jobType: updates.jobType,
        platformTargetCount: normalizedPlatformIds?.length ?? 0,
      },
    });

    return Response.json(result[0]);
  } catch (error) {
    console.error("POST /api/schedules/[id] error:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}

// PATCH /api/schedules/[id] { enabled } or { paused } — pause/resume a schedule.
// Session or read_write API key; scoped to the caller's workspace.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof Response) return tenant;

  const body = (await request.json().catch(() => null)) as { enabled?: unknown; paused?: unknown } | null;
  const enabled =
    typeof body?.enabled === "boolean"
      ? body.enabled
      : typeof body?.paused === "boolean"
        ? !body.paused
        : null;
  if (enabled === null) {
    return Response.json({ error: "Provide boolean `enabled` or `paused`." }, { status: 400 });
  }

  const { id: scheduleId } = await params;
  const result = await db
    .update(schedules)
    .set({ enabled, updatedAt: new Date() })
    .where(and(eq(schedules.id, scheduleId), eq(schedules.workspaceId, tenant.currentWorkspace.id)))
    .returning({ id: schedules.id });
  if (result.length === 0) {
    return Response.json({ error: "Schedule not found" }, { status: 404 });
  }

  await reconcileSchedules("schedule:update");
  await recordTenantAuditEvent(tenant, {
    action: "schedule.update",
    targetType: "schedule",
    targetId: scheduleId,
    metadata: {
      status: enabled ? "scheduled" : "paused",
      endpoint: `PATCH /api/schedules/${scheduleId}`,
    },
  });
  return Response.json({ success: true, id: scheduleId, enabled });
}
