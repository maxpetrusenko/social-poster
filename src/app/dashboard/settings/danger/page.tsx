import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SettingsDangerPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  return (
    <div>
      <h2 className="text-lg font-semibold text-red-600 mb-1">Danger Zone</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Irreversible actions that affect your account</p>

      <div className="space-y-5 max-w-lg">
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Delete Workspace</h3>
          <p className="text-xs text-[#8d7c64] mb-3">
            Permanently deletes <strong>{tenant.currentWorkspace.name}</strong>, all posts, schedules, and connected accounts.
          </p>
          <button disabled className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed">
            Delete Workspace (coming soon)
          </button>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50/30 p-5">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Delete Organization</h3>
          <p className="text-xs text-[#8d7c64] mb-3">
            Permanently deletes <strong>{tenant.organization.name}</strong>, all workspaces, members, and data.
          </p>
          <button disabled className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white opacity-60 cursor-not-allowed">
            Delete Organization (coming soon)
          </button>
        </div>

        <div className="rounded-xl border border-[#e5d9c8] bg-white p-5">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Export Data</h3>
          <p className="text-xs text-[#8d7c64] mb-3">Download all your posts, schedules, and account data.</p>
          <button disabled className="rounded-lg border border-[#e5d9c8] px-4 py-2 text-sm font-medium text-[#8d7c64] opacity-60 cursor-not-allowed">
            Export data (coming soon)
          </button>
        </div>
      </div>
    </div>
  );
}
