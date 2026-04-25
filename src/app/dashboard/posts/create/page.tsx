import { db } from "@/db";
import { profiles, platforms, rssSources } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getTenantContext } from "@/lib/tenancy";
import { redirect } from "next/navigation";
import { mapComposerPlatforms } from "@/lib/dashboard/composer";
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
    db.select().from(platforms).where(eq(platforms.workspaceId, wsId)),
    db.select({ id: rssSources.id }).from(rssSources).where(eq(rssSources.workspaceId, wsId)),
  ]);

  const composerPlatforms = mapComposerPlatforms(platformRows);

  return (
    <CreatePostComposer
      profiles={profileRows}
      rssSourceCount={rssSourceRows.length}
      platforms={composerPlatforms}
    />
  );
}
