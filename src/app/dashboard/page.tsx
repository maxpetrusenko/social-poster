import { db } from "@/db";
import { posts, pipelineRuns, platforms, schedules } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import { Activity, CheckCircle, XCircle, Clock, FileText, Share2 } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import Link from "next/link";

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm"
    >
      <div className="rounded-md bg-indigo-50 p-2.5">
        <Icon className="h-5 w-5 text-indigo-600" />
      </div>
      <div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const platformCount = db.select({ n: count() }).from(platforms).get()?.n ?? 0;
  const postCount = db.select({ n: count() }).from(posts).get()?.n ?? 0;
  const scheduleCount = db.select({ n: count() }).from(schedules).where(eq(schedules.enabled, true)).get()?.n ?? 0;

  const recentRuns = db
    .select()
    .from(pipelineRuns)
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(10)
    .all();

  const recentPosts = db
    .select()
    .from(posts)
    .orderBy(desc(posts.createdAt))
    .limit(5)
    .all();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Dashboard</h1>

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Platforms" value={platformCount} icon={Share2} href="/dashboard/platforms" />
        <StatCard label="Posts" value={postCount} icon={FileText} href="/dashboard/posts" />
        <StatCard label="Active Schedules" value={scheduleCount} icon={Clock} href="/dashboard/schedules" />
        <StatCard label="Pipeline Runs" value={recentRuns.length} icon={Activity} href="/dashboard/pipeline" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Recent pipeline runs */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-medium">Recent Pipeline Runs</h2>
            <Link href="/dashboard/pipeline" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentRuns.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">No runs yet</p>
            ) : (
              recentRuns.slice(0, 5).map((run) => (
                <div key={run.id} className="flex items-center gap-3 px-4 py-2.5">
                  {run.status === "completed" ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : run.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-500" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{run.scheduleId ?? run.trigger}</p>
                    <p className="text-xs text-gray-400">{relativeTime(run.startedAt)}</p>
                  </div>
                  {run.durationMs && (
                    <span className="text-xs tabular-nums text-gray-400">
                      {(run.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent posts */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <h2 className="text-sm font-medium">Recent Posts</h2>
            <Link href="/dashboard/posts" className="text-xs text-indigo-600 hover:underline">View all</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentPosts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-400">No posts yet</p>
                {recentRuns.length > 0 ? (
                  <p className="mt-2 text-xs text-gray-500">
                    Legacy restore brought back pipeline history only. Old social-agent did not store post records.
                  </p>
                ) : null}
              </div>
            ) : (
              recentPosts.map((post) => (
                <div key={post.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      post.status === "published"
                        ? "bg-green-50 text-green-700"
                        : post.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : post.status === "scheduled"
                            ? "bg-blue-50 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {post.status}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm">
                    {post.title ?? post.content.slice(0, 80)}
                  </p>
                  <span className="shrink-0 text-xs text-gray-400">
                    {relativeTime(post.createdAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
