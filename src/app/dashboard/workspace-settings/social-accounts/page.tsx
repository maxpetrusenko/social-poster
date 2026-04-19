import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { PLATFORM_TYPES } from "@/lib/platforms";
import { ConnectionsPage } from "@/components/dashboard/connections-page";
import { getRequestAppUrl } from "@/lib/app-url";
import { getConnectionsPageData } from "@/lib/dashboard/connections-data";
import { canManageCurrentWorkspace, getTenantContext } from "@/lib/tenancy";
import { getNativeConnectionAvailabilityByPlatform } from "@/lib/providers/env-availability";
import { resolveOAuthCallbackOverride } from "@/lib/providers/oauth-state";

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
  const requestHeaders = await headers();
  const appUrl = getRequestAppUrl({ headers: requestHeaders as Headers });
  const oauthCallbackUrlOverride = resolveOAuthCallbackOverride(
    process.env.SOCIAL_POSTER_OAUTH_CALLBACK_URL,
    appUrl
  );

  return (
    <ConnectionsPage
      workspaceName={tenant.currentWorkspace.name}
      platforms={data.platforms}
      profiles={data.profiles}
      insights={data.insights}
      initialDrawerOpen={Boolean(params.connect)}
      initialPlatformType={initialPlatformType}
      initialError={params.error ?? null}
      nativeAvailabilityByPlatform={nativeAvailabilityByPlatform}
      oauthCallbackUrlOverride={oauthCallbackUrlOverride}
    />
  );
}
