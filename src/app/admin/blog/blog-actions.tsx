"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Archive, ExternalLink, Loader2, Send, WandSparkles } from "lucide-react";

type Props = {
  configured: boolean;
  setupCommand: string;
  posts: Array<{
    id: string;
    title: string;
    slug: string;
    status: string;
    publishStatus: string;
    validationStatus: string;
    validationScore: number;
    externalDraftPath: string | null;
  }>;
};

export function BlogActions({ configured, setupCommand, posts }: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submitGenerate(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/blog/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: formData.get("topic"),
          targetWords: Number(formData.get("targetWords") || 2000),
          sourceUrls: String(formData.get("sourceUrls") || "")
            .split("\n")
            .map((url) => url.trim())
            .filter(Boolean),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || "Generation failed.");
        return;
      }
      setMessage(`Draft created: ${body.slug}`);
      window.location.reload();
    });
  }

  function mutatePost(id: string, action: "publish" | "archive") {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/blog/${id}/${action}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error || `${action} failed.`);
        return;
      }
      setMessage(action === "publish" ? `Published: ${body.slug}` : "Archived.");
      window.location.reload();
    });
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-serif text-xl font-semibold text-[#171717]">Generate Daily Draft</h2>
            <p className="mt-1 text-sm text-[#8d7c64]">
              Review-gated. Medium automation is used when configured; otherwise a framework draft is created.
            </p>
          </div>
          <span className="rounded-full bg-[#f4ebdd] px-3 py-1 text-xs font-semibold text-[#5f523f]">
            {configured ? "Medium automation ready" : "Fallback mode"}
          </span>
        </div>

        {!configured ? (
          <div className="mt-4 rounded-lg border border-[#eadcca] bg-[#faf4ea] p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8d7c64]">Setup command</p>
            <code className="mt-2 block overflow-x-auto rounded-md bg-[#171717] px-3 py-2 text-xs text-[#fffaf2]">
              {setupCommand}
            </code>
          </div>
        ) : null}

        <form action={submitGenerate} className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold text-[#5f523f]">
            Topic
            <input
              name="topic"
              required
              placeholder="Answer engine optimization for social scheduling"
              className="rounded-lg border border-[#d9cab6] bg-[#fffaf2] px-3 py-2 text-[#171717] outline-none focus:border-[#171717]"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-[#5f523f]">
            Source URLs
            <textarea
              name="sourceUrls"
              rows={4}
              placeholder="One primary source URL per line"
              className="rounded-lg border border-[#d9cab6] bg-[#fffaf2] px-3 py-2 text-[#171717] outline-none focus:border-[#171717]"
            />
          </label>
          <label className="grid max-w-[180px] gap-1 text-sm font-semibold text-[#5f523f]">
            Target words
            <input
              name="targetWords"
              type="number"
              min={1200}
              max={4000}
              defaultValue={2200}
              className="rounded-lg border border-[#d9cab6] bg-[#fffaf2] px-3 py-2 text-[#171717] outline-none focus:border-[#171717]"
            />
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#171717] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            Generate draft
          </button>
          {message ? <p className="text-sm font-semibold text-[#5f523f]">{message}</p> : null}
        </form>
      </section>

      <section className="rounded-xl border border-[#e5d9c8] bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[#8d7c64]">Review Queue</h2>
        <div className="mt-4 space-y-3">
          {posts.length ? posts.map((post) => (
            <div key={post.id} className="rounded-lg border border-[#eadcca] bg-[#faf4ea] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold text-[#171717]">{post.title}</p>
                  <p className="mt-1 text-xs text-[#8d7c64]">
                    {post.status} / {post.publishStatus} / {post.validationStatus} {post.validationScore}/110
                  </p>
                  {post.externalDraftPath ? (
                    <p className="mt-1 text-xs text-[#8d7c64]">{post.externalDraftPath}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/admin/blog/${post.id}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#d7c7b2] bg-white px-3 py-2 text-xs font-semibold text-[#5f523f]"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview
                  </Link>
                  {post.publishStatus !== "published" ? (
                    <button
                      onClick={() => mutatePost(post.id, "publish")}
                      disabled={isPending || post.validationStatus === "fail"}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#171717] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Publish
                    </button>
                  ) : null}
                  <button
                    onClick={() => mutatePost(post.id, "archive")}
                    disabled={isPending}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#d7c7b2] bg-white px-3 py-2 text-xs font-semibold text-[#5f523f]"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archive
                  </button>
                </div>
              </div>
            </div>
          )) : (
            <p className="text-sm text-[#8d7c64]">No blog automation drafts yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
