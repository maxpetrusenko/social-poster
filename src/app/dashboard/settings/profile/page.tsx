import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SettingsProfilePage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const user = tenant.user;
  const initials = user.fullName
    ? user.fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user.email[0].toUpperCase();
  const providerLabel = user.authProvider === "google" ? "Google" : "Magic Link";

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Profile</h2>
      <p className="text-sm text-[#8d7c64] mb-6">Your personal account details</p>

      <div className="rounded-xl border border-[#e5d9c8] bg-white p-6 max-w-lg">
        <div className="flex items-center gap-4 mb-6">
          {user.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-full bg-[#e5d9c8] flex items-center justify-center text-lg font-semibold text-[#8d7c64]">
              {initials}
            </div>
          )}
          <div>
            <p className="font-semibold text-[#171717]">{user.fullName || "No name set"}</p>
            <p className="text-sm text-[#8d7c64]">{user.email}</p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
            <span className="text-[#8d7c64]">Email</span>
            <span className="text-[#171717]">{user.email}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-[#e5d9c8]">
            <span className="text-[#8d7c64]">Auth Provider</span>
            <span className="rounded-full bg-[#f5f0e6] px-2.5 py-0.5 text-xs font-medium text-[#8d7c64]">{providerLabel}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-[#8d7c64]">User ID</span>
            <span className="font-mono text-xs text-[#8d7c64]">{user.id.slice(0, 12)}...</span>
          </div>
        </div>

        <button disabled className="mt-6 w-full rounded-lg border border-[#e5d9c8] py-2 text-sm font-medium text-[#8d7c64] cursor-not-allowed opacity-60">
          Edit profile (coming soon)
        </button>
      </div>
    </div>
  );
}
