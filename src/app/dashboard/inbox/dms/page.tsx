import { redirect } from "next/navigation";
import { SocialInboxSurface } from "@/components/dashboard/social-inbox-surface";
import { getSocialInboxSurfaceData, markInboxSurfaceSeen } from "@/lib/inbox/data";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function InboxDmsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const data = await getSocialInboxSurfaceData(tenant.currentWorkspace.id, "dms");
  await markInboxSurfaceSeen(tenant.currentWorkspace.id, "dms");

  return (
    <SocialInboxSurface
      surface="dms"
      platforms={data.platforms}
      rows={data.rows}
    />
  );
}
