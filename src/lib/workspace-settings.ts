import { db } from "@/db";
import { workspaceSettings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function getWorkspaceSetting(workspaceId: string, key: string) {
  const row = await db.query.workspaceSettings.findFirst({
    where: and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key)),
  });
  return row?.value ?? null;
}

export async function setWorkspaceSetting(workspaceId: string, key: string, value: string) {
  const now = new Date();
  await db
    .insert(workspaceSettings)
    .values({ workspaceId, key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: [workspaceSettings.workspaceId, workspaceSettings.key],
      set: { value, updatedAt: now },
    });
}

export async function clearWorkspaceSetting(workspaceId: string, key: string) {
  await db
    .delete(workspaceSettings)
    .where(and(eq(workspaceSettings.workspaceId, workspaceId), eq(workspaceSettings.key, key)));
}
