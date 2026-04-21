import { RepliesMockShowcase } from "@/components/dashboard/replies-mock-showcase";
import { getRepliesPageData } from "@/lib/dashboard/replies-data";
import { getTenantContext } from "@/lib/tenancy";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function InboxRepliesPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");
  const data = await getRepliesPageData(tenant.currentWorkspace.id);

  return (
    <div className="space-y-6">
      <RepliesMockShowcase
        connections={data.connections}
        profiles={data.profiles}
        initialCards={data.candidates}
        initialLanguage={data.defaultLanguage}
      />
    </div>
  );
}
