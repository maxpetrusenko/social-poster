import Link from "next/link";
import { ExternalLink, Eye, FileText } from "lucide-react";
import type {
  GeneratedArticleReviewItem,
  PublicArticlePreviewItem,
} from "@/lib/article-agent/review-dashboard";

type ArticleReviewDashboardProps = {
  generated: GeneratedArticleReviewItem[];
  publicArticles: PublicArticlePreviewItem[];
};

export function ArticleReviewDashboard({
  generated,
  publicArticles,
}: ArticleReviewDashboardProps) {
  return (
    <section
      data-testid="article-review-dashboard"
      className="overflow-hidden rounded-[24px] border border-[#d8cab5] bg-white shadow-[0_14px_36px_rgba(23,23,23,0.06)]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#eadfce] px-5 py-5 sm:px-6">
        <div>
          <p className="section-eyebrow text-[#806f58]">Article Review</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-[#171717]">
            Generated articles and live links
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#806f58]">
            Review each generated draft here. Published articles open on the live SMM Agent website.
          </p>
        </div>
        <Link
          href="/dashboard/articles/preview"
          className="inline-flex items-center gap-2 rounded-full border border-[#d8cab5] bg-[#fbf6ed] px-4 py-2.5 text-sm font-semibold text-[#3d3328] transition hover:border-[#af987b]"
        >
          <Eye className="h-4 w-4" />
          Preview website
        </Link>
      </div>

      <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#5f523f]">
              Recent generated articles
            </h3>
            <span className="rounded-full bg-[#f4ebdd] px-2.5 py-1 text-xs font-semibold text-[#5f523f]">
              {generated.length}
            </span>
          </div>

          {generated.length ? (
            <div className="mt-3 divide-y divide-[#eadfce] overflow-hidden rounded-[18px] border border-[#eadfce]">
              {generated.map((article) => (
                <GeneratedArticleRow key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-[18px] border border-dashed border-[#d8cab5] bg-[#fbf6ed] px-5 py-8 text-center">
              <FileText className="mx-auto h-6 w-6 text-[#806f58]" />
              <p className="mt-3 text-sm font-semibold text-[#3d3328]">
                No generated articles yet
              </p>
              <Link
                href="/dashboard/articles/new"
                className="mt-3 inline-flex text-sm font-semibold text-[#0f6179] hover:underline"
              >
                Generate an article
              </Link>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#5f523f]">
              Published on SMM Agent
            </h3>
            <span className="rounded-full bg-[#e6f4ea] px-2.5 py-1 text-xs font-semibold text-[#28633a]">
              {publicArticles.length} live
            </span>
          </div>

          <div className="mt-3 space-y-2">
            {publicArticles.length ? (
              publicArticles.map((article) => (
                <a
                  key={article.slug}
                  href={article.publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-[16px] border border-[#eadfce] bg-[#fbf6ed] px-4 py-3 transition hover:border-[#cdbb9f] hover:bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="line-clamp-2 text-sm font-semibold leading-5 text-[#171717]">
                        {article.title}
                      </p>
                      <p className="mt-1 text-xs text-[#806f58]">
                        {article.category} · {article.publishedAt}
                      </p>
                    </div>
                    <ExternalLink
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#806f58] transition group-hover:text-[#0f6179]"
                    />
                  </div>
                  <span className="sr-only"> (opens in new tab)</span>
                </a>
              ))
            ) : (
              <p className="rounded-[16px] border border-dashed border-[#d8cab5] bg-[#fbf6ed] px-4 py-6 text-center text-sm text-[#806f58]">
                No public articles found.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GeneratedArticleRow({
  article,
}: {
  article: GeneratedArticleReviewItem;
}) {
  return (
    <article className="bg-white px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={statusClassName(article.status)}>{formatStatus(article.status)}</span>
            <span className="rounded-full bg-[#f4ebdd] px-2.5 py-1 text-xs font-semibold text-[#5f523f]">
              {formatStatus(article.validationStatus)} {article.validationScore}/110
            </span>
          </div>
          <h4 className="mt-3 text-base font-semibold leading-6 text-[#171717]">
            {article.title}
          </h4>
          <p className="mt-1 truncate font-mono text-[11px] text-[#806f58]">{article.slug}</p>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <Link
            href={article.reviewHref}
            className="rounded-full bg-[#171717] px-3 py-2 text-white transition hover:bg-[#3d3328]"
          >
            Review draft
          </Link>
          {article.publicUrl ? (
            <a
              href={article.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#d8cab5] bg-[#fbf6ed] px-3 py-2 text-[#3d3328] transition hover:border-[#af987b]"
            >
              View on smmagent.app
              <span className="sr-only"> (opens in new tab)</span>
              <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function statusClassName(status: string) {
  const normalized = status.toLowerCase();
  const colors =
    normalized === "published"
      ? "bg-[#e6f4ea] text-[#28633a]"
      : normalized.includes("review")
        ? "bg-[#fff1d6] text-[#8a5a00]"
        : "bg-[#e8f4f7] text-[#0f6179]";

  return `rounded-full px-2.5 py-1 text-xs font-semibold ${colors}`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}
