import Link from "next/link";
import { ExternalLink, Plus, Settings } from "lucide-react";
import { ArticleReviewDashboard } from "@/components/articles/article-review-dashboard";
import { ArticleWorkspace } from "@/components/articles/article-workspace";
import { getArticleReviewDashboardData } from "@/lib/article-agent/review-dashboard";
import {
  getArticleWorkspaceKanbanColumns,
  getArticleWorkspacePreview,
  listArticleWorkspaceArticleSummaries,
  listArticleWorkspaceTrees,
} from "@/lib/article-agent/workspace";
import {
  getYouTubeMediumQueueSnapshot,
  type YouTubeMediumQueueItem,
  type YouTubeMediumQueueSnapshot,
} from "@/lib/article-agent/youtube-medium-queue";

export const dynamic = "force-dynamic";

type ArticlesPageProps = {
  searchParams?: Promise<{ open?: string }>;
};

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const params = await searchParams;
  const [trees, preview, articles, kanbanColumns, youtubeQueue, articleReviewData] = await Promise.all([
    listArticleWorkspaceTrees(),
    getArticleWorkspacePreview(params?.open),
    listArticleWorkspaceArticleSummaries(),
    getArticleWorkspaceKanbanColumns(),
    getYouTubeMediumQueueSnapshot(),
    getArticleReviewDashboardData(),
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
        <ArticleReviewDashboard
          generated={articleReviewData.generated}
          publicArticles={articleReviewData.publicArticles}
        />
      </div>

      <div className="mt-8">
        <YouTubeMediumQueue snapshot={youtubeQueue} />
      </div>

      <div className="mt-8">
        <ArticleWorkspace trees={trees} preview={preview} articles={articles} kanbanColumns={kanbanColumns} />
      </div>
    </div>
  );
}

function YouTubeMediumQueue({ snapshot }: { snapshot: YouTubeMediumQueueSnapshot | null }) {
  if (!snapshot) {
    return (
      <section className="rounded-[20px] border border-[#d8cab5] bg-white px-5 py-4 shadow-[0_10px_28px_rgba(23,23,23,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow text-[#806f58]">YouTube to Medium Queue</p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-[#171717]">No queue snapshot yet</h2>
          </div>
          <code className="rounded-[12px] bg-[#fbf6ed] px-3 py-2 text-xs font-semibold text-[#5f523f]">
            npm run articles:sync-youtube-queue
          </code>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-[#d8cab5] bg-white shadow-[0_10px_28px_rgba(23,23,23,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eadfce] px-5 py-4">
        <div>
          <p className="section-eyebrow text-[#806f58]">YouTube to Medium Queue</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold text-[#171717]">Playlist processing state</h2>
          <p className="mt-2 text-sm leading-6 text-[#806f58]">
            Current playlist proof, local packages, and public Medium RSS reconciled at {formatDateTime(snapshot.generatedAt)}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#5f523f] sm:grid-cols-4">
          <Metric label="Posted" value={snapshot.summary.posted} />
          <Metric label="Needs approval" value={snapshot.summary.needsApproval} tone="warn" />
          <Metric label="Missing" value={snapshot.summary.missingArticle} tone="danger" />
          <Metric label="Current" value={snapshot.summary.totalCurrentPlaylist} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#eadfce] text-left text-sm">
          <thead className="bg-[#fbf6ed] text-xs font-semibold uppercase tracking-[0.14em] text-[#806f58]">
            <tr>
              <th className="px-5 py-3">Source</th>
              <th className="px-5 py-3">State</th>
              <th className="px-5 py-3">Article</th>
              <th className="px-5 py-3">Next</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eadfce] bg-white">
            {snapshot.items.map((item) => (
              <QueueRow key={item.videoId} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {snapshot.historical.length ? (
        <div className="border-t border-[#eadfce] px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#806f58]">Historical posted, no longer in playlist</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {snapshot.historical.map((item) => (
              <a
                key={item.videoId}
                href={item.mediumUrl || item.dashboardUrl || "#"}
                className="rounded-full border border-[#d8cab5] bg-[#fbf6ed] px-3 py-1.5 text-xs font-semibold text-[#5f523f]"
              >
                {item.title}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function QueueRow({ item }: { item: YouTubeMediumQueueItem }) {
  return (
    <tr className="align-top">
      <td className="max-w-[360px] px-5 py-4">
        <div className="flex gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f4ebdd] text-xs font-semibold text-[#5f523f]">
            {item.position ?? ""}
          </span>
          <div className="min-w-0">
            <a href={item.sourceUrl} className="font-semibold leading-5 text-[#171717] hover:underline">
              {item.title}
            </a>
            <p className="mt-1 font-mono text-[11px] text-[#806f58]">{item.videoId}</p>
            {item.channel ? <p className="mt-1 text-xs text-[#806f58]">{item.channel}</p> : null}
          </div>
        </div>
      </td>
      <td className="px-5 py-4">
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClassName(item.status)}`}>
          {item.statusLabel}
        </span>
        {item.rating ? (
          <p className="mt-2 text-xs font-semibold text-[#5f523f]">
            {item.rating}/{item.ratingTarget ?? 9.5}
          </p>
        ) : null}
      </td>
      <td className="max-w-[340px] px-5 py-4">
        {item.articleTitle ? (
          <div>
            <p className="font-semibold leading-5 text-[#171717]">{item.articleTitle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
              {item.dashboardUrl ? <QueueLink href={item.dashboardUrl} label="Package" /> : null}
              {item.publicPreviewUrl ? <QueueLink href={item.publicPreviewUrl} label="Preview" external /> : null}
              {item.mediumUrl ? <QueueLink href={item.mediumUrl} label="Medium" external /> : null}
            </div>
          </div>
        ) : (
          <p className="text-sm text-[#806f58]">No local package found.</p>
        )}
      </td>
      <td className="max-w-[360px] px-5 py-4">
        <p className="text-sm leading-6 text-[#3d3328]">{item.nextAction}</p>
        {item.proof?.length ? (
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#806f58]">{item.proof.join(" ")}</p>
        ) : null}
      </td>
    </tr>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" | "danger" }) {
  return (
    <div className={`rounded-[14px] border px-3 py-2 ${metricClassName(tone)}`}>
      <p className="text-[11px] uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function QueueLink({ href, label, external = false }: { href: string; label: string; external?: boolean }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 rounded-full bg-[#f4ebdd] px-2.5 py-1 text-[#5f523f] hover:bg-[#eadfce]">
      {label}
      {external ? <ExternalLink className="h-3 w-3" /> : null}
    </a>
  );
}

function statusClassName(status: YouTubeMediumQueueItem["status"]) {
  if (status === "posted" || status === "posted_not_in_current_playlist") return "bg-[#e6f4ea] text-[#28633a]";
  if (status === "needs_review") return "bg-[#fff1d6] text-[#8a5a00]";
  if (status === "missing_article") return "bg-[#fde8e3] text-[#9c3b2f]";
  return "bg-[#e8f4f7] text-[#0f6179]";
}

function metricClassName(tone: "neutral" | "warn" | "danger") {
  if (tone === "warn") return "border-[#e6c16a] bg-[#fff8e8] text-[#8a5a00]";
  if (tone === "danger") return "border-[#efb1a5] bg-[#fff1ee] text-[#9c3b2f]";
  return "border-[#eadfce] bg-[#fbf6ed] text-[#5f523f]";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
