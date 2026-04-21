import { db } from "@/db";
import {
  pipelineRuns,
  platforms,
  postTargets,
  posts,
  workspaces,
} from "@/db/schema";
import { count, desc, eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">
        {label}
      </p>
      <p className="mt-1 font-serif text-2xl leading-none text-[#171717]">
        {value}
      </p>
      {sub ? <p className="mt-1 text-xs text-[#8d7c64]">{sub}</p> : null}
    </div>
  );
}

function BarRow({
  label,
  value,
  max,
  accent = "#0f7ea9",
}: {
  label: string;
  value: number;
  max: number;
  accent?: string;
}) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 4 : 0) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-24 shrink-0 text-right text-xs font-semibold uppercase tracking-wide text-[#8d7c64]">
        {label}
      </span>
      <div className="flex-1">
        <div className="h-5 w-full rounded-full bg-[#f5f0e6]">
          <div
            className="h-5 rounded-full transition-all"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, ${accent}, ${accent}88)`,
            }}
          />
        </div>
      </div>
      <span className="w-12 text-right text-sm font-semibold text-[#171717]">
        {value}
      </span>
    </div>
  );
}

const platformColors: Record<string, string> = {
  x: "#000000",
  linkedin: "#0a66c2",
  facebook: "#1877f2",
  instagram: "#e4405f",
  threads: "#000000",
  tiktok: "#010101",
  youtube: "#ff0000",
  mastodon: "#6364ff",
  pinterest: "#e60023",
};

const statusColors: Record<string, string> = {
  published: "#22c55e",
  failed: "#ef4444",
  draft: "#8d7c64",
  scheduled: "#0f7ea9",
  publishing: "#f59e0b",
};

export default async function AdminUsagePage() {
  const [byPlatform, byStatus, topWorkspaces, pipelineStats] =
    await Promise.all([
      db
        .select({
          type: platforms.type,
          count: count(),
        })
        .from(postTargets)
        .innerJoin(platforms, eq(platforms.id, postTargets.platformId))
        .groupBy(platforms.type)
        .orderBy(desc(count())),
      db
        .select({
          status: posts.status,
          count: count(),
        })
        .from(posts)
        .groupBy(posts.status)
        .orderBy(desc(count())),
      db
        .select({
          name: workspaces.name,
          count: count(),
        })
        .from(posts)
        .innerJoin(workspaces, eq(workspaces.id, posts.workspaceId))
        .groupBy(workspaces.id, workspaces.name)
        .orderBy(desc(count()))
        .limit(10),
      db
        .select({
          total: count(),
          completed: sql<number>`sum(case when ${pipelineRuns.status} = 'completed' then 1 else 0 end)`,
          failed: sql<number>`sum(case when ${pipelineRuns.status} = 'failed' then 1 else 0 end)`,
          avgDuration: sql<number>`avg(${pipelineRuns.durationMs})`,
        })
        .from(pipelineRuns),
    ]);

  const pipeline = pipelineStats[0];
  const successRate =
    pipeline && pipeline.total > 0
      ? Math.round(((pipeline.completed ?? 0) / pipeline.total) * 100)
      : 0;
  const avgDurationSec = pipeline?.avgDuration
    ? (pipeline.avgDuration / 1000).toFixed(1)
    : "0";

  const maxPlatform = Math.max(...byPlatform.map((r) => r.count), 1);
  const maxStatus = Math.max(...byStatus.map((r) => r.count), 1);
  const maxWorkspace = Math.max(...topWorkspaces.map((r) => r.count), 1);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold text-[#171717]">
          Usage
        </h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          Platform-wide publishing and pipeline statistics
        </p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Runs" value={pipeline?.total ?? 0} />
        <StatCard label="Success Rate" value={`${successRate}%`} />
        <StatCard label="Failed" value={pipeline?.failed ?? 0} />
        <StatCard label="Avg Duration" value={`${avgDurationSec}s`} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">
            Posts by Platform
          </h2>
          <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
            {byPlatform.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#8d7c64]">
                No post targets yet.
              </p>
            ) : (
              byPlatform.map((row) => (
                <BarRow
                  key={row.type}
                  label={row.type}
                  value={row.count}
                  max={maxPlatform}
                  accent={platformColors[row.type] ?? "#8d7c64"}
                />
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">
            Posts by Status
          </h2>
          <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
            {byStatus.length === 0 ? (
              <p className="py-4 text-center text-sm text-[#8d7c64]">
                No posts yet.
              </p>
            ) : (
              byStatus.map((row) => (
                <BarRow
                  key={row.status}
                  label={row.status}
                  value={row.count}
                  max={maxStatus}
                  accent={statusColors[row.status] ?? "#8d7c64"}
                />
              ))
            )}
          </div>
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">
          Top Workspaces by Post Count
        </h2>
        <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
          {topWorkspaces.length === 0 ? (
            <p className="py-4 text-center text-sm text-[#8d7c64]">
              No workspace posts yet.
            </p>
          ) : (
            topWorkspaces.map((row, i) => (
              <BarRow
                key={row.name}
                label={`#${i + 1}`}
                value={row.count}
                max={maxWorkspace}
                accent="#d2a35d"
              />
            ))
          )}
          {topWorkspaces.length > 0 && (
            <div className="mt-2 space-y-0.5 pl-[calc(6rem+12px)]">
              {topWorkspaces.map((row, i) => (
                <p key={row.name} className="text-xs text-[#8d7c64]">
                  <span className="font-semibold">#{i + 1}</span> {row.name}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
