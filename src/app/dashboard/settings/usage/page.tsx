import { redirect } from "next/navigation";
import { getTenantContext } from "@/lib/tenancy";
import { db } from "@/db";
import { platforms, profiles, usageEvents } from "@/db/schema";
import { eq, and, count, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="h-2 w-full rounded-full bg-[#e5d9c8]">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MetricCard({ label, value, max, unlimited, resets }: {
  label: string; value: number; max?: number; unlimited?: boolean; resets: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
      <p className="text-sm font-medium text-[#8d7c64] mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#171717]">
        {value}
        {max != null && <span className="text-sm font-normal text-[#8d7c64]"> / {max}</span>}
        {unlimited && <span className="text-sm font-normal text-[#8d7c64]"> / Unlimited</span>}
      </p>
      {max != null && <div className="mt-3"><ProgressBar value={value} max={max} /></div>}
      <p className="text-xs text-[#8d7c64] mt-2">Resets {resets}</p>
    </div>
  );
}

export default async function SettingsUsagePage() {
  const tenant = await getTenantContext();
  if (!tenant) redirect("/login");

  const wsId = tenant.currentWorkspace.id;
  const org = tenant.organization;
  const cycleStart = org.billingCycleStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const cycleResets = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const [[profileCount], [platformCount], usageRows] = await Promise.all([
    db.select({ count: count() }).from(profiles).where(eq(profiles.workspaceId, wsId)),
    db.select({ count: count() }).from(platforms).where(eq(platforms.workspaceId, wsId)),
    db.select({ eventType: usageEvents.eventType, count: count() })
      .from(usageEvents)
      .where(and(eq(usageEvents.workspaceId, wsId), gte(usageEvents.createdAt, cycleStart)))
      .groupBy(usageEvents.eventType),
  ]);

  const uc: Record<string, number> = {};
  for (const row of usageRows) uc[row.eventType] = row.count;

  return (
    <div>
      <h2 className="text-lg font-semibold text-[#171717] mb-1">Usage</h2>
      <p className="text-sm text-[#8d7c64] mb-6">
        Current billing cycle usage for your <strong>{org.planLabel}</strong> plan
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <MetricCard label="Posts Published" value={uc["post_published"] || 0} max={org.maxPostsPerMonth} resets={cycleResets} />
        <MetricCard label="Profiles" value={profileCount?.count || 0} max={org.maxProfiles} resets={cycleResets} />
        <MetricCard label="Connected Accounts" value={platformCount?.count || 0} max={org.maxPlatforms} resets={cycleResets} />
        <MetricCard label="Replies Sent" value={uc["reply_sent"] || 0} resets={cycleResets} />
        <MetricCard label="Comments Sent" value={uc["comment_sent"] || 0} resets={cycleResets} />
        <MetricCard label="DMs Sent" value={uc["dm_sent"] || 0} resets={cycleResets} />
        <MetricCard label="Uploads" value={uc["upload"] || 0} unlimited resets={cycleResets} />
        <MetricCard label="API Calls" value={uc["api_call"] || 0} resets={cycleResets} />
      </div>
    </div>
  );
}
