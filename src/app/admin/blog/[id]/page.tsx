import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { db } from "@/db";
import { blogAutomationPosts, blogAutomationRuns } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { BlogMarkdownRenderer } from "@/components/blog/markdown-renderer";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function AdminBlogReviewPage({ params }: Props) {
  const { id } = await params;
  const [post] = await db
    .select()
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.id, id))
    .limit(1);

  if (!post) notFound();

  const runs = await db
    .select()
    .from(blogAutomationRuns)
    .where(eq(blogAutomationRuns.postId, id))
    .orderBy(desc(blogAutomationRuns.startedAt))
    .limit(8);

  const checks = Array.isArray(post.frameworkChecks?.checks)
    ? post.frameworkChecks.checks as Array<{ key: string; label: string; status: string; detail: string }>
    : [];

  return (
    <div>
      <Link href="/admin/blog" className="mb-6 inline-block text-sm font-semibold text-[#5f523f] hover:underline">
        Back to Blog Automation
      </Link>

      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
            {post.status}
          </span>
          <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
            {post.validationStatus} {post.validationScore}/110
          </span>
        </div>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-[#171717]">{post.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-[#8d7c64]">{post.excerpt}</p>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="rounded-xl border border-[#e5d9c8] bg-white p-6">
          {post.heroImageUrl ? (
            <figure className="mb-8 overflow-hidden rounded-xl border border-[#eadcca] bg-[#faf4ea]">
              <Image
                src={post.heroImageUrl}
                alt={post.heroImageAlt || ""}
                width={1200}
                height={675}
                className="h-auto w-full object-cover"
                unoptimized
              />
            </figure>
          ) : null}
          <BlogMarkdownRenderer markdown={post.contentMarkdown} />
        </article>

        <aside className="space-y-6">
          <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Framework Checks</h2>
            <div className="mt-4 space-y-2">
              {checks.length ? checks.map((check) => (
                <div key={check.key} className="rounded-lg bg-[#faf4ea] px-3 py-2">
                  <p className="text-sm font-semibold text-[#171717]">{check.label}</p>
                  <p className="mt-1 text-xs text-[#8d7c64]">{check.status}: {check.detail}</p>
                </div>
              )) : (
                <p className="text-sm text-[#8d7c64]">No checks stored.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Sources</h2>
            <div className="mt-4 space-y-2">
              {(post.sources ?? []).length ? post.sources?.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg bg-[#faf4ea] px-3 py-2 text-sm font-semibold text-[#5f523f] hover:underline"
                >
                  {source.title || source.url}
                </a>
              )) : (
                <p className="text-sm text-[#8d7c64]">No sources attached.</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Runs</h2>
            <div className="mt-4 space-y-2">
              {runs.length ? runs.map((run) => (
                <div key={run.id} className="rounded-lg bg-[#faf4ea] px-3 py-2">
                  <p className="text-sm font-semibold text-[#171717]">{run.phase} / {run.status}</p>
                  <p className="mt-1 text-xs text-[#8d7c64]">{run.startedAt.toLocaleString()}</p>
                </div>
              )) : (
                <p className="text-sm text-[#8d7c64]">No runs recorded.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
