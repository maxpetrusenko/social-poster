import { db } from "@/db";
import { platforms, posts, postTargets, schedules } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

type PlatformRow = typeof platforms.$inferSelect;
type ScheduleRow = typeof schedules.$inferSelect;
type PostTargetRow = typeof postTargets.$inferSelect;

export type DashboardWorkspaceScope = {
  platformRows: PlatformRow[];
  platformIds: string[];
  platformIdSet: Set<string>;
  scheduleRows: ScheduleRow[];
  scheduleIdSet: Set<string>;
  postIds: string[];
  postIdSet: Set<string>;
  targetRows: PostTargetRow[];
};

export function runTargetsWorkspace(
  run: Pick<
    { workspaceId: string | null; scheduleId: string | null; postId: string | null },
    "workspaceId" | "scheduleId" | "postId"
  >,
  workspaceId: string,
  scheduleIdSet: Set<string>,
  postIdSet: Set<string>
) {
  if (run.workspaceId === workspaceId) {
    return true;
  }

  if (run.scheduleId && scheduleIdSet.has(run.scheduleId)) {
    return true;
  }

  if (run.postId && postIdSet.has(run.postId)) {
    return true;
  }

  return false;
}

export async function getDashboardWorkspaceScope(
  workspaceId: string
): Promise<DashboardWorkspaceScope> {
  const platformRows = await db
    .select()
    .from(platforms)
    .where(eq(platforms.workspaceId, workspaceId));
  const platformIds = platformRows.map((platform) => platform.id);
  const platformIdSet = new Set(platformIds);

  const scheduleRows = await db
    .select()
    .from(schedules)
    .where(eq(schedules.workspaceId, workspaceId))
    .orderBy(schedules.createdAt);
  const scheduleIdSet = new Set(scheduleRows.map((schedule) => schedule.id));

  const postRows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(eq(posts.workspaceId, workspaceId));
  const postIds = postRows.map((post) => post.id);
  const postIdSet = new Set(postIds);

  const targetRows =
    postIds.length > 0 && platformIds.length > 0
      ? await db
          .select()
          .from(postTargets)
          .where(
            and(
              inArray(postTargets.platformId, platformIds),
              inArray(postTargets.postId, postIds)
            )
          )
      : [];

  return {
    platformRows,
    platformIds,
    platformIdSet,
    scheduleRows,
    scheduleIdSet,
    postIds,
    postIdSet,
    targetRows,
  };
}
