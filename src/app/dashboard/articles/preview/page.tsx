import { ExternalLink } from "lucide-react";

const ARTICLE_SITE_URL = "https://smmagent.app/blog";

export default function ArticleWebsitePreviewPage() {
  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 md:px-8">
      <section className="overflow-hidden rounded-[24px] border border-[#d8cab5] bg-white shadow-[0_16px_45px_rgba(23,23,23,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eadfce] bg-[#fbf6ed] px-5 py-4">
          <div>
            <p className="section-eyebrow text-[#806f58]">Website Preview</p>
            <h1 className="mt-2 font-serif text-3xl font-semibold text-[#171717]">
              Published articles on SMM Agent
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#806f58]">
              This is the live public article index, not a local draft renderer.
            </p>
          </div>
          <a
            href={ARTICLE_SITE_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3d3328]"
          >
            Open smmagent.app
            <span className="sr-only"> (opens in new tab)</span>
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
          </a>
        </div>

        <div className="bg-[#f4ebdd] p-2 sm:p-3">
          <iframe
            title="SMM Agent published articles"
            src={ARTICLE_SITE_URL}
            className="h-[72vh] min-h-[620px] w-full rounded-[18px] border border-[#d8cab5] bg-white"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </section>
    </div>
  );
}
