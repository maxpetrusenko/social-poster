import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SettingsBillingPage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const org = tenant.organization;

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Billing</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Manage your subscription and billing details</p>

      <div className="max-w-lg space-y-5">
        {/* Current plan */}
        <div className="rounded-xl border border-[#e5d9c8] bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#8d7c64]">Current Plan</p>
              <p className="text-2xl font-bold text-[#171717] mt-1">{org.planLabel}</p>
            </div>
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">ACTIVE</span>
          </div>
          <div className="space-y-2 text-sm border-t border-[#e5d9c8] pt-4">
            <div className="flex justify-between">
              <span className="text-[#8d7c64]">Posts / month</span>
              <span className="font-medium text-[#171717]">{org.maxPostsPerMonth}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8d7c64]">Profiles</span>
              <span className="font-medium text-[#171717]">{org.maxProfiles}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8d7c64]">Connected accounts</span>
              <span className="font-medium text-[#171717]">{org.maxPlatforms}</span>
            </div>
          </div>
        </div>

        {/* Payment (placeholder) */}
        <div className="rounded-xl border border-[#e5d9c8] bg-white p-6">
          <h3 className="text-sm font-semibold text-[#171717] mb-3">Payment</h3>
          <p className="text-sm text-[#8d7c64]">No payment method configured yet.</p>
          <button disabled className="mt-4 rounded-lg border border-[#e5d9c8] px-4 py-2 text-sm font-medium text-[#8d7c64] cursor-not-allowed opacity-60">
            Add payment method (coming soon)
          </button>
        </div>

        {/* Billing email */}
        <div className="rounded-xl border border-[#e5d9c8] bg-white p-6">
          <h3 className="text-sm font-semibold text-[#171717] mb-1">Billing email</h3>
          <p className="text-sm text-[#8d7c64]">{org.billingEmail || "Not set — invoices will go to the org owner."}</p>
        </div>

        {/* Upgrade CTA */}
        <button disabled className="w-full rounded-xl border border-[#e5d9c8] bg-white py-3 text-sm font-medium text-[#8d7c64] cursor-not-allowed opacity-60">
          Upgrade plan (coming soon)
        </button>
      </div>
    </div>
  );
}
