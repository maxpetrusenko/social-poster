import { redirect } from "next/navigation";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { ConnectionsPage } from "@/components/dashboard/connections-page";
import { getConnectionsPageData } from "@/lib/dashboard/connections-data";
import { canManageCurrentWorkspace, getTenantContext } from "@/lib/tenancy";
import { getNativeConnectionAvailabilityByPlatform } from "@/lib/providers/env-availability";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsSocialAccountsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = searchParams ? await searchParams : {};
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  if (!canManageCurrentWorkspace(tenant)) redirect("/dashboard");
  const initialPlatformType = PLATFORM_TYPES.includes(
    (params.platform as (typeof PLATFORM_TYPES)[number]) ?? "twitter"
  )
    ? ((params.platform as (typeof PLATFORM_TYPES)[number]) ?? null)
    : null;

  const data = await getConnectionsPageData(tenant.currentWorkspace.id);
  const nativeAvailabilityByPlatform = getNativeConnectionAvailabilityByPlatform();
  const oauthCallbackUrlOverride =
    process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL?.trim() || null;

  return (
    <ConnectionsPage
      workspaceName={tenant.currentWorkspace.name}
      organizationName={tenant.organization.name}
      platforms={data.platforms}
      profiles={data.profiles}
      insights={data.insights}
      initialDrawerOpen={Boolean(params.connect)}
      initialPlatformType={initialPlatformType}
      nativeAvailabilityByPlatform={nativeAvailabilityByPlatform}
      oauthCallbackUrlOverride={oauthCallbackUrlOverride}
    />
  );
}
