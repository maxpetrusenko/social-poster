import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SettingsGeneralPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const org = tenant.organization;
  const ws = tenant.currentWorkspace;

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">General</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Organization and workspace defaults</p>

      <div className="space-y-4 max-w-lg">
        <div className="rounded-xl border border-[#e5d9c8] bg-white p-5">
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
              <span className="text-[#8d7c64]">Organization</span>
              <span className="font-medium text-[#171717]">{org.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
              <span className="text-[#8d7c64]">Workspace</span>
              <span className="font-medium text-[#171717]">{ws.name}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
              <span className="text-[#8d7c64]">Timezone</span>
              <span className="text-[#171717]">{ws.timezone || org.defaultTimezone}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-[#8d7c64]">Org ID</span>
              <span className="font-mono text-xs text-[#8d7c64]">{org.id}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
