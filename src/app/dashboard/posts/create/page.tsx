import { db } from "@/db";
import { profiles, platforms, rssSources } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";
import { redirect } from "next/navigation";
import {
  mapComposerPlatforms,
  parseComposerPlatformConfig,
} from "@/lib/dashboard/composer";
import { CreatePostComposer } from "@/components/create-post-composer";

export default async function CreatePostPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect("/login");

  const wsId = ctx.currentWorkspace.id;
  const [profileRows, platformRows, rssSourceRows] = await Promise.all([
    db
      .select({ id: profiles.id, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.workspaceId, wsId)),
    db
      .select({
        id: platforms.id,
        workspaceId: platforms.workspaceId,
        name: platforms.name,
        type: platforms.type,
        handle: platforms.handle,
        accountId: platforms.accountId,
        provider: platforms.provider,
        enabled: platforms.enabled,
        configRaw: sql<string | null>`${platforms.config}`,
        createdAt: platforms.createdAt,
        updatedAt: platforms.updatedAt,
      })
      .from(platforms)
      .where(eq(platforms.workspaceId, wsId)),
    db.select({ id: rssSources.id }).from(rssSources).where(eq(rssSources.workspaceId, wsId)),
  ]);

  const composerPlatforms = mapComposerPlatforms(
    platformRows.map((platform) => ({
      ...platform,
      config: parseComposerPlatformConfig(platform.configRaw),
    }))
  );

  return (
    <CreatePostComposer
      profiles={profileRows}
      rssSourceCount={rssSourceRows.length}
      platforms={composerPlatforms}
    />
  );
}
