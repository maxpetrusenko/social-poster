import { OverviewPlatformTable } from "@/components/dashboard/overview-platform-table";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { relativeTime } from "@/lib/utils";
import { getTenantContext } from "@/lib/tenancy";

export const dynamic = "force-dynamic";

const providerLabels = {
  bird: "Bird",
  direct: "Direct",
  zernio: "Relay",
} as const;

function formatProviderLabel(value: string) {
  return providerLabels[value as keyof typeof providerLabels] ?? value;
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

function buildDonut(parts: Array<{ value: number; color: string }>) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total <= 0) {
    return "conic-gradient(from -90deg, #171717 0 100%)";
  }

  let cursor = 0;
  const segments = parts.map((part) => {
    const start = cursor;
    const end = cursor + (part.value / total) * 100;
    cursor = end;
    return `${part.color} ${start}% ${end}%`;
  });

  return `conic-gradient(from -90deg, ${segments.join(", ")})`;
}

function SectionPill({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[#3a342b] bg-[#171717] px-4 py-2 text-[0.82rem] font-semibold uppercase tracking-[0.22em] text-[#f6efe3]">
      {label}
    </div>
  );
}

function Donut({ background }: { background: string }) {
  return (
    <div className="relative mx-auto aspect-square w-[10rem] rounded-full md:w-[11.5rem]" style={{ background }}>
      <div className="absolute inset-[25%] rounded-full bg-[#fbf7f0]" />
    </div>
  );
}

function MetricCard({
  title,
  value,
  sub,
  donut,
}: {
  title: string;
  value: string;
  sub: string;
  donut: string;
}) {
  return (
    <article className="grid gap-6 rounded-[2rem] border border-[#d4c6b1] bg-[#fbf7f0] p-6 shadow-[0_18px_40px_rgba(23,23,23,0.05)] md:grid-cols-[1fr_12rem] md:items-center">
      <div>
        <p className="text-[1.15rem] font-medium tracking-[-0.03em] text-[#75634d]">{title}</p>
        <p className="mt-3 text-[3.05rem] leading-none tracking-[-0.07em] text-[#171717]">{value}</p>
        <p className="mt-4 text-sm leading-6 text-[#7b6b56]">{sub}</p>
      </div>
      <Donut background={donut} />
    </article>
  );
}

export default async function DashboardPage() {
  const tenant = await getTenantContext();
  if (!tenant) {
    return null;
  }

  const dashboard = await getDashboardInsights(tenant.currentWorkspace.id);
  const platformRows = [...dashboard.platformInsights];
  const enabledCount = platformRows.filter((platform) => platform.enabled).length;
  const disabledCount = platformRows.length - enabledCount;

  const cards = [
    {
      title: "Connected accounts",
      value: String(platformRows.length),
      sub: `${enabledCount} enabled · ${disabledCount} disabled`,
      donut: buildDonut([
        { value: enabledCount, color: "#171717" },
        { value: Math.max(disabledCount, 0), color: "#d8c9b4" },
      ]),
    },
    {
      title: "Scheduled channels",
      value: String(
        platformRows.filter((platform) => platform.scheduleCount > 0).length
      ),
      sub: `${platformRows.reduce((sum, platform) => sum + platform.scheduleCount, 0)} scheduled targets`,
      donut: buildDonut([
        {
          value: platformRows.filter((platform) => platform.scheduleCount > 0).length,
          color: "#171717",
        },
        {
          value: platformRows.filter((platform) => platform.scheduleCount === 0).length,
          color: "#8e7556",
        },
      ]),
    },
  ] as const;

  const rows = platformRows
    .map((platform) => {
      return {
        id: platform.id,
        name: platform.name,
        handle: platform.handle,
        provider: formatProviderLabel(platform.provider),
        enabled: platform.enabled,
        scheduleCount: platform.scheduleCount,
        deliveryCount30d: platform.deliveryCount30d,
        failureCount30d: platform.failureCount30d,
        lastDeliveredAtLabel: platform.lastDeliveredAt ? relativeTime(platform.lastDeliveredAt) : "No deliveries yet",
        shortLabel: platform.shortLabel,
        accent: platform.accent,
      };
    })
    .sort((left, right) => {
      if (left.enabled !== right.enabled) {
        return left.enabled ? -1 : 1;
      }

      if (left.deliveryCount30d !== right.deliveryCount30d) {
        return right.deliveryCount30d - left.deliveryCount30d;
      }

      return left.name.localeCompare(right.name);
    });

  const deliveryCount30d = rows.reduce((sum, row) => sum + row.deliveryCount30d, 0);
  const failureCount30d = rows.reduce((sum, row) => sum + row.failureCount30d, 0);
  const scheduleCount = rows.reduce((sum, row) => sum + row.scheduleCount, 0);
  const lastActivityLabel =
    dashboard.lastPublishedAt ? relativeTime(dashboard.lastPublishedAt) : "No runs yet";

  const activityCards = [
    {
      title: "Deliveries, 30d",
      value: formatCompactNumber(deliveryCount30d),
      sub: `${dashboard.publishedPieces30d} completed publish runs`,
      donut: buildDonut([
        { value: deliveryCount30d, color: "#171717" },
        { value: Math.max(failureCount30d, 0), color: "#b69d80" },
      ]),
    },
    {
      title: "Failures, 30d",
      value: formatCompactNumber(failureCount30d),
      sub:
        dashboard.scheduleRuntimeDrift === 0
          ? "Scheduler state in sync"
          : `${Math.abs(dashboard.scheduleRuntimeDrift)} schedule drift detected`,
      donut: buildDonut([
        { value: Math.max(failureCount30d, 1), color: "#9b4b39" },
        {
          value: Math.max(deliveryCount30d - failureCount30d, 0),
          color: "#eadfce",
        },
      ]),
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#fff8ef_0%,transparent_32%),linear-gradient(180deg,#f5f0e6_0%,#eee5d7_100%)]">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-8 px-5 py-6 md:px-8 md:py-8 xl:px-10">
        <section className="space-y-8">
          <div className="grid gap-6 xl:grid-cols-4">
            <div className="space-y-4 xl:col-span-2">
              <SectionPill label="Connections" />
              <div className="grid gap-6 md:grid-cols-2">
                {cards.slice(0, 2).map((card) => (
                  <MetricCard
                    key={card.title}
                    title={card.title}
                    value={card.value}
                    sub={card.sub}
                    donut={card.donut}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <SectionPill label="Activity" />
              <MetricCard {...activityCards[0]} />
            </div>

            <div className="space-y-4">
              <SectionPill label="Health" />
              <MetricCard {...activityCards[1]} />
            </div>
          </div>

          <section className="rounded-[2.3rem] border border-[#d4c7b2] bg-[rgba(252,248,241,0.94)] p-5 shadow-[0_20px_48px_rgba(23,23,23,0.05)] md:p-6">
            <OverviewPlatformTable
              rows={rows}
              totals={{
                enabledCount,
                accountCount: rows.length,
                scheduleCount,
                deliveryCount30d,
                failureCount30d,
                lastActivityLabel,
              }}
            />
          </section>
        </section>
      </div>
    </div>
  );
}
