import { db } from "@/db";
import { platforms, workspaces } from "@/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  parseXLikedAutopostWorkspaceIds,
  selectXLikedAutopostWorkspaceIds,
} from "./x-liked-autopost-workspace-selection";

export { parseXLikedAutopostWorkspaceIds } from "./x-liked-autopost-workspace-selection";

export async function findXLikedAutopostWorkspaceIds() {
  const configuredIds = parseXLikedAutopostWorkspaceIds();
  if (configuredIds.length > 0) return configuredIds;

  const rows = await db
    .select({
      workspaceId: workspaces.id,
      platformType: platforms.type,
      provider: platforms.provider,
      enabled: platforms.enabled,
    })
    .from(workspaces)
    .innerJoin(platforms, eq(platforms.workspaceId, workspaces.id))
    .where(
      and(
        eq(platforms.enabled, true),
        inArray(platforms.type, ["x", "twitter", "linkedin_personal"])
      )
    )
    .orderBy(asc(workspaces.createdAt), asc(platforms.createdAt));

  return selectXLikedAutopostWorkspaceIds(rows, configuredIds);
}

export async function resolveDefaultXLikedAutopostWorkspaceId() {
  const ids = await findXLikedAutopostWorkspaceIds();
  return ids[0] ?? null;
}
