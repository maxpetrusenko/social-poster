import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { blogAutomationPosts, blogAutomationRuns } from "@/db/schema";
import { ArticleEditor } from "@/components/articles/article-editor";
import { BlogMarkdownRenderer } from "@/components/blog/markdown-renderer";

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

export default async function ArticleDetailPage({ params }: Props) {
  const { id } = await params;
  const [article] = await db
    .select()
    .from(blogAutomationPosts)
    .where(eq(blogAutomationPosts.id, id))
    .limit(1);

  if (!article) notFound();

  const runs = await db
    .select()
    .from(blogAutomationRuns)
    .where(eq(blogAutomationRuns.postId, id))
    .orderBy(desc(blogAutomationRuns.startedAt))
    .limit(8);

  const checks = Array.isArray(article.frameworkChecks?.checks)
    ? (article.frameworkChecks.checks as Array<{
        key: string;
        label: string;
        status: string;
        detail: string;
      }>)
    : [];

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <Link href="/dashboard/articles" className="text-sm font-semibold text-[#5f523f] hover:underline">
        Back to Articles
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
          {article.status}
        </span>
        <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
          {article.validationStatus} {article.validationScore}/110
        </span>
        <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
          API /api/article/{article.id}
        </span>
      </div>

      <div className="mt-5">
        <h1 className="max-w-4xl font-serif text-4xl font-semibold leading-tight text-[#171717]">
          {article.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-[#806f58]">{article.excerpt}</p>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <main className="space-y-6">
          <article className="rounded-[22px] border border-[#d4c6b1] bg-white p-6">
            {article.heroImageUrl ? (
              <figure className="mb-8 overflow-hidden rounded-[18px] border border-[#eadfce] bg-[#fffaf2]">
                <Image
                  src={article.heroImageUrl}
                  alt={article.heroImageAlt || ""}
                  width={1200}
                  height={675}
                  className="h-auto w-full object-cover"
                  unoptimized
                />
              </figure>
            ) : null}
            <BlogMarkdownRenderer markdown={article.contentMarkdown} />
          </article>

          <ArticleEditor
            article={{
              id: article.id,
              title: article.title,
              excerpt: article.excerpt,
              contentMarkdown: article.contentMarkdown,
              heroImageUrl: article.heroImageUrl,
              heroImageAlt: article.heroImageAlt,
            }}
          />
        </main>

        <aside className="space-y-5">
          <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
              Framework Checks
            </h2>
            <div className="mt-4 space-y-2">
              {checks.length ? (
                checks.map((check) => (
                  <div key={check.key} className="rounded-[14px] bg-[#fffaf2] px-3 py-2">
                    <p className="text-sm font-semibold text-[#171717]">{check.label}</p>
                    <p className="mt-1 text-xs text-[#806f58]">
                      {check.status}: {check.detail}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#806f58]">No checks stored.</p>
              )}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
              Sources
            </h2>
            <div className="mt-4 space-y-2">
              {(article.sources ?? []).length ? (
                article.sources?.map((source) => (
                  <a
                    key={source.url}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-[14px] bg-[#fffaf2] px-3 py-2 text-sm font-semibold text-[#5f523f] hover:underline"
                  >
                    {source.title || source.url}
                  </a>
                ))
              ) : (
                <p className="text-sm text-[#806f58]">No sources attached.</p>
              )}
            </div>
          </section>

          <section className="rounded-[22px] border border-[#d4c6b1] bg-white p-5">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
              Runs
            </h2>
            <div className="mt-4 space-y-2">
              {runs.length ? (
                runs.map((run) => (
                  <div key={run.id} className="rounded-[14px] bg-[#fffaf2] px-3 py-2">
                    <p className="text-sm font-semibold text-[#171717]">
                      {run.phase} / {run.status}
                    </p>
                    <p className="mt-1 text-xs text-[#806f58]">{run.startedAt.toLocaleString()}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#806f58]">No runs recorded.</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
