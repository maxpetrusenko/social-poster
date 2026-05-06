"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";

type ArticleEditorProps = {
  article: {
    id: string;
    title: string;
    excerpt: string;
    contentMarkdown: string;
    heroImageUrl: string | null;
    heroImageAlt: string | null;
  };
};

export function ArticleEditor({ article }: ArticleEditorProps) {
  const [title, setTitle] = useState(article.title);
  const [excerpt, setExcerpt] = useState(article.excerpt);
  const [contentMarkdown, setContentMarkdown] = useState(article.contentMarkdown);
  const [heroImageUrl, setHeroImageUrl] = useState(article.heroImageUrl ?? "");
  const [heroImageAlt, setHeroImageAlt] = useState(article.heroImageAlt ?? "");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setStatus("");
    try {
      const response = await fetch(`/api/article/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          excerpt,
          contentMarkdown,
          heroImageUrl: heroImageUrl.trim() || null,
          heroImageAlt: heroImageAlt.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Save failed.");
      setStatus(`Saved. Validation: ${body.validation.status} ${body.validation.score}/110.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[20px] border border-[#d4c6b1] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-[#806f58]">
          Edit Markdown
        </h2>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-[#171717] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </button>
      </div>
      <div className="mt-5 grid gap-3">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="rounded-[14px] border border-[#d8cab5] px-3 py-2 text-sm text-[#171717] outline-none"
        />
        <textarea
          value={excerpt}
          onChange={(event) => setExcerpt(event.target.value)}
          rows={2}
          className="resize-none rounded-[14px] border border-[#d8cab5] px-3 py-2 text-sm text-[#171717] outline-none"
        />
        <input
          value={heroImageUrl}
          onChange={(event) => setHeroImageUrl(event.target.value)}
          placeholder="Hero image URL"
          className="rounded-[14px] border border-[#d8cab5] px-3 py-2 text-sm text-[#171717] outline-none"
        />
        <input
          value={heroImageAlt}
          onChange={(event) => setHeroImageAlt(event.target.value)}
          placeholder="Hero image alt"
          className="rounded-[14px] border border-[#d8cab5] px-3 py-2 text-sm text-[#171717] outline-none"
        />
        <textarea
          value={contentMarkdown}
          onChange={(event) => setContentMarkdown(event.target.value)}
          rows={22}
          className="resize-y rounded-[14px] border border-[#d8cab5] bg-[#fffaf2] px-3 py-3 font-mono text-xs leading-6 text-[#171717] outline-none"
        />
      </div>
      {status ? <p className="mt-3 text-sm font-medium text-[#5f523f]">{status}</p> : null}
    </section>
  );
}
