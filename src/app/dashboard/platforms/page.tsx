import Link from "next/link";
import { Plus } from "lucide-react";
import { DashboardHero, HeroButton, MetricCard, PlatformChip, SectionCard, StatusBadge } from "@/components/dashboard/ui";
import { getDashboardInsights } from "@/lib/dashboard/insights";

export default async function PlatformsPage() {
  const { platformInsights } = await getDashboardInsights();
  const enabled = platformInsights.filter((platform) => platform.enabled).length;
  const errors = platformInsights.reduce((sum, platform) => sum + platform.failureCount30d, 0);
  const deliveries = platformInsights.reduce((sum, platform) => sum + platform.deliveryCount30d, 0);

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Connected platforms"
        title="Distribution map"
        description="Every account, attached schedules, last delivery, and 30-day error count. No more blind list."
        actions={
          <>
            <HeroButton href="/dashboard">Overview</HeroButton>
            <HeroButton href="/dashboard/platforms/new" tone="ghost">Connect</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Connected" value={platformInsights.length} sub={`${enabled} enabled`} />
        <MetricCard label="Deliveries, 30d" value={deliveries} sub="successful platform publishes" accent="var(--accent-spirit)" />
        <MetricCard label="Errors, 30d" value={errors} sub="platform-level publish failures" accent={errors > 0 ? "#dc2626" : "var(--accent-mindfold)"} />
      </div>

      <SectionCard
        title="Platform roster"
        subtitle="Same data model, cleaner signal."
        action={
          <Link
            href="/dashboard/platforms/new"
            className="inline-flex items-center gap-2 rounded-[10px] bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-[var(--sand)]"
          >
            <Plus className="h-4 w-4" />
            Add
          </Link>
        }
      >
        <div className="space-y-4">
          {platformInsights.map((platform) => (
            <Link
              key={platform.id}
              href={`/dashboard/platforms/${platform.id}`}
              className="block rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-5 transition hover:-translate-y-0.5 hover:border-[rgba(15,126,169,0.18)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <PlatformChip
                      label={platform.name}
                      accent={platform.accent}
                      shortLabel={platform.shortLabel}
                    />
                    <StatusBadge tone={platform.enabled ? "good" : "neutral"}>
                      {platform.enabled ? "live" : "off"}
                    </StatusBadge>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-[var(--ink)]">
                    {platform.handle || "no handle stored"}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge tone={platform.failureCount30d > 0 ? "warn" : "good"}>
                    {platform.deliveryCount30d} delivered
                  </StatusBadge>
                  <StatusBadge tone={platform.failureCount30d > 0 ? "bad" : "neutral"}>
                    {platform.failureCount30d} errors
                  </StatusBadge>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Schedules</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{platform.scheduleCount}</p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Success</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{platform.successRate30d}%</p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Last delivery</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">
                    {platform.lastDeliveredAt ? platform.lastDeliveredAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "none"}
                  </p>
                </div>
                <div>
                  <p className="section-eyebrow text-[var(--muted)]">Type</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--ink)]">{platform.type}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
