import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { ProfileCampaignsDashboard } from "@/components/profiles/profile-campaigns-dashboard";
import { listCampaignDetails } from "@/lib/campaigns/records";
import { getTenantContext } from "@/lib/tenancy";
import type { Profile } from "@/components/profiles/profile-workspace-config";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const allProfiles = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workspaceId, tenant.currentWorkspace.id))
    .then((rows) => rows as Profile[]);
  const workspacePlatforms = await db
    .select({
      id: platforms.id,
      type: platforms.type,
      name: platforms.name,
      handle: platforms.handle,
      enabled: platforms.enabled,
    })
    .from(platforms)
    .where(eq(platforms.workspaceId, tenant.currentWorkspace.id));
  const campaignRecords = await listCampaignDetails(tenant.currentWorkspace.id);

  return (
    <ProfileCampaignsDashboard
      initialProfiles={allProfiles}
      initialPlatforms={workspacePlatforms}
      initialCampaignRecords={campaignRecords}
    />
  );
}
