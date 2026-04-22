import { db } from "@/db";
import { blogAutomationPosts, blogAutomationRuns } from "@/db/schema";
import { count, desc, eq } from "drizzle-orm";
import { getMediumAutomationConfig } from "@/lib/blog/medium-automation";
import { BlogActions } from "./blog-actions";

export const dynamic = "force-dynamic";

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e5d9c8] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8d7c64]">{label}</p>
      <p className="mt-1 font-serif text-2xl leading-none text-[#171717]">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#8d7c64]">{sub}</p> : null}
    </div>
  );
}

export default async function AdminBlogPage() {
  const config = getMediumAutomationConfig();
  const [
    [total],
    [drafts],
    [published],
    recentPosts,
    recentRuns,
  ] = await Promise.all([
    db.select({ count: count() }).from(blogAutomationPosts),
    db.select({ count: count() }).from(blogAutomationPosts).where(eq(blogAutomationPosts.publishStatus, "idle")),
    db.select({ count: count() }).from(blogAutomationPosts).where(eq(blogAutomationPosts.publishStatus, "published")),
    db
      .select()
      .from(blogAutomationPosts)
      .orderBy(desc(blogAutomationPosts.createdAt))
      .limit(20),
    db
      .select()
      .from(blogAutomationRuns)
      .orderBy(desc(blogAutomationRuns.startedAt))
      .limit(6),
  ]);

  const setupCommand =
    "MEDIUM_AUTOMATION_API_URL=http://127.0.0.1:3001 MEDIUM_AUTOMATION_API_KEY=<local-key> BLOG_AUTOMATION_DAILY_ENABLED=true";

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-serif text-2xl font-semibold text-[#171717]">Blog Automation</h1>
        <p className="mt-1 text-sm text-[#8d7c64]">
          Daily researched article drafts with image, source checks, and a human publish gate.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Total Drafts" value={total.count} />
        <Card label="Needs Review" value={drafts.count} />
        <Card label="Published" value={published.count} />
        <Card
          label="Daily Worker"
          value={process.env.BLOG_AUTOMATION_DAILY_ENABLED === "true" ? "On" : "Off"}
          sub="Generates one draft per day, never autopublishes."
        />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_320px]">
        <BlogActions
          configured={config.configured}
          setupCommand={setupCommand}
          posts={recentPosts.map((post) => ({
            id: post.id,
            title: post.title,
            slug: post.slug,
            status: post.status,
            publishStatus: post.publishStatus,
            validationStatus: post.validationStatus,
            validationScore: post.validationScore,
            externalDraftPath: post.externalDraftPath,
          }))}
        />

        <aside className="rounded-xl border border-[#e5d9c8] bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Recent Runs</h2>
          <div className="mt-4 space-y-3">
            {recentRuns.length ? recentRuns.map((run) => (
              <div key={run.id} className="rounded-lg bg-[#faf4ea] px-3 py-2">
                <p className="text-sm font-semibold text-[#171717]">{run.phase} / {run.status}</p>
                <p className="mt-1 text-xs text-[#8d7c64]">{run.trigger} at {run.startedAt.toLocaleString()}</p>
                {run.error ? <p className="mt-1 text-xs text-[#9c3b2f]">{run.error}</p> : null}
              </div>
            )) : (
              <p className="text-sm text-[#8d7c64]">No runs yet.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
