import { db } from "@/db";
import { platforms, profiles, schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import crypto from "node:crypto";
import { getTenantContext } from "@/lib/tenancy";
import { and, eq, inArray } from "drizzle-orm";

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, cron, cronHuman, jobType, profileId, targetPlatformIds, enabled, config } = body;

    if (!name || !cron || !jobType) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalizedProfileId =
      typeof profileId === "string" && profileId.trim() ? profileId.trim() : null;
    const normalizedPlatformIds = Array.isArray(targetPlatformIds)
      ? Array.from(new Set(targetPlatformIds.filter((value: unknown): value is string => typeof value === "string")))
      : [];

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

    if (normalizedPlatformIds.length > 0) {
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

    const id = crypto.randomUUID();
    const now = new Date();

    const result = await db
      .insert(schedules)
      .values({
        id,
        workspaceId: tenant.currentWorkspace.id,
        name,
        description: description || null,
        cron,
        cronHuman: cronHuman || null,
        jobType,
        profileId: normalizedProfileId,
        targetPlatformIds: normalizedPlatformIds,
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
