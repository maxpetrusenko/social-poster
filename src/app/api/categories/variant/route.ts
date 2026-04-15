import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, schedules } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { reconcileSchedules } from "@/lib/scheduler";
import { getTenantContext } from "@/lib/tenancy";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePlatformKey(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "x" ? "twitter" : normalized;
}

function copyRecord(source: unknown) {
  return isObject(source) ? { ...source } : {};
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session instanceof Response) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      scheduleId?: string;
      contentByPlatform?: Record<string, string>;
    };

    if (!body.scheduleId) {
      return Response.json({ error: "Missing schedule id." }, { status: 400 });
    }

    const schedule = await db.query.schedules.findFirst({
      where: and(
        eq(schedules.id, body.scheduleId),
        eq(schedules.workspaceId, tenant.currentWorkspace.id)
      ),
    });

    if (!schedule) {
      return Response.json({ error: "Schedule not found." }, { status: 404 });
    }

    const targetPlatforms = await db
      .select({
        id: platforms.id,
        type: platforms.type,
        workspaceId: platforms.workspaceId,
      })
      .from(platforms)
      .where(eq(platforms.workspaceId, tenant.currentWorkspace.id));

    const selectedPlatforms = (schedule.targetPlatformIds ?? [])
      .map((platformId) => targetPlatforms.find((platform) => platform.id === platformId))
      .filter(
        (
          platform
        ): platform is {
          id: string;
          type: string;
          workspaceId: string | null;
        } => Boolean(platform)
      );

    if (selectedPlatforms.length === 0) {
      return Response.json(
        { error: "Schedule has no target platforms." },
        { status: 400 }
      );
    }

    const incoming = isObject(body.contentByPlatform) ? body.contentByPlatform : null;
    if (!incoming) {
      return Response.json({ error: "Missing platform content." }, { status: 400 });
    }

    const normalizedContent = Object.fromEntries(
      Object.entries(incoming)
        .map(([key, value]) => [normalizePlatformKey(key), pickString(value)])
        .filter(([, value]) => Boolean(value))
    ) as Record<string, string>;

    const missingPlatforms = selectedPlatforms
      .map((platform) => normalizePlatformKey(platform.type))
      .filter((key) => !normalizedContent[key]);

    if (missingPlatforms.length > 0) {
      return Response.json(
        { error: "Provide copy for every target platform." },
        { status: 400 }
      );
    }

    const config = copyRecord(schedule.config);
    const contentVariantsByPlatform = copyRecord(config.contentVariantsByPlatform);
    const contentByPlatform = copyRecord(config.contentByPlatform);

    selectedPlatforms.forEach((platform) => {
      const key = normalizePlatformKey(platform.type);
      const nextValue = normalizedContent[key];
      const existing = Array.isArray(contentVariantsByPlatform[key])
        ? [...(contentVariantsByPlatform[key] as string[])]
        : [];

      if (existing.length === 0) {
        const legacyValue = pickString(contentByPlatform[key]) || pickString(config.content);
        if (legacyValue) {
          existing.push(legacyValue);
        }
      }

      existing.push(nextValue);
      contentVariantsByPlatform[key] = existing;
    });

    const nextConfig: Record<string, unknown> = {
      ...config,
      postMode: "fixed",
      contentVariantsByPlatform,
    };

    await db
      .update(schedules)
      .set({
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(schedules.id, schedule.id));

    await reconcileSchedules("category:variant:add");

    return Response.json({ ok: true });
  } catch (error) {
    console.error("POST /api/categories/variant error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
