import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import { ArticleWorkspace } from "@/components/articles/article-workspace";
import {
  getArticleWorkspaceKanbanColumns,
  getArticleWorkspacePreview,
  listArticleWorkspaceArticleSummaries,
  listArticleWorkspaceTrees,
} from "@/lib/article-agent/workspace";

export const dynamic = "force-dynamic";

type ArticlesPageProps = {
  searchParams?: Promise<{ open?: string }>;
};

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const params = await searchParams;
  const [trees, preview, articles, kanbanColumns] = await Promise.all([
    listArticleWorkspaceTrees(),
    getArticleWorkspacePreview(params?.open),
    listArticleWorkspaceArticleSummaries(),
    getArticleWorkspaceKanbanColumns(),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="section-eyebrow text-[#806f58]">Article Generation</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[0.01em] text-[#171717]">
            Articles
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#806f58]">
            Filesystem-backed article memory: versions, images, sources, evals, skills, and GBrain/wiki context in one VS Code-style light explorer.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/dashboard/articles/settings"
            className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-white px-4 py-2 text-sm font-semibold text-[#5f523f]"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            href="/dashboard/articles/new"
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New Article
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <ArticleWorkspace trees={trees} preview={preview} articles={articles} kanbanColumns={kanbanColumns} />
      </div>
    </div>
  );
}
