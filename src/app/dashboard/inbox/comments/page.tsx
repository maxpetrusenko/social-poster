import { redirect } from "next/navigation";
import { SocialInboxSurface } from "@/components/dashboard/social-inbox-surface";
import { getSocialInboxSurfaceData } from "@/lib/inbox/data";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function InboxCommentsPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const data = await getSocialInboxSurfaceData(
    tenant.currentWorkspace.id,
    "comments"
  );

  return (
    <SocialInboxSurface
      surface="comments"
      platforms={data.platforms}
      rows={data.rows}
    />
  );
}
