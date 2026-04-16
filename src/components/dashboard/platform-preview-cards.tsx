"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

// ── OG metadata lazy loader ──────────────────────────────────────────

type OgMeta = {
  imageUrl: string | null;
  title: string | null;
  description: string | null;
  host: string;
};

const ogMetaCache = new Map<string, OgMeta | null>();

export function useOgMeta(sourceUrl: string | null) {
  const [meta, setMeta] = useState<OgMeta | null>(
    sourceUrl ? ogMetaCache.get(sourceUrl) ?? null : null
  );
  const [loading, setLoading] = useState(
    Boolean(sourceUrl && !ogMetaCache.has(sourceUrl))
  );

  useEffect(() => {
    if (!sourceUrl) return;
    if (ogMetaCache.has(sourceUrl)) {
      setMeta(ogMetaCache.get(sourceUrl) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/og-meta?url=${encodeURIComponent(sourceUrl)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: OgMeta | null) => {
        ogMetaCache.set(sourceUrl, data);
        if (!cancelled) {
          setMeta(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sourceUrl]);

  return { meta, loading };
}

// ── Helpers ──────────────────────────────────────────────────────────

function getSourceHost(url: string | null | undefined) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ── Shared types ─────────────────────────────────────────────────────

export type PlatformPreviewData = {
  type: string;
  label: string;
  shortLabel: string;
  content: string | null;
  mediaUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  firstComment: string | null;
  handle: string | null;
  publishedUrl: string | null;
  status: string | null;
  error: string | null;
};

// ── OG link card ─────────────────────────────────────────────────────

export function OgLinkCard({
  sourceUrl,
  sourceHost,
  imageUrl: providedImageUrl,
  compact = false,
}: {
  sourceUrl: string;
  sourceHost: string | null;
  imageUrl: string | null;
  compact?: boolean;
}) {
  const { meta, loading } = useOgMeta(providedImageUrl ? null : sourceUrl);
  const imageUrl = providedImageUrl ?? meta?.imageUrl ?? null;
  const title = meta?.title ?? null;
  const description = meta?.description ?? null;
  const host = sourceHost ?? meta?.host ?? getSourceHost(sourceUrl) ?? sourceUrl;

  return (
    <a
      href={sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group block overflow-hidden rounded-[14px] border border-slate-200 bg-white transition hover:border-slate-400"
    >
      {loading ? (
        <div
          className={`flex w-full items-center justify-center bg-slate-100 ${compact ? "h-32" : "h-48"}`}
        >
          <span className="text-xs text-slate-400">Loading preview…</span>
        </div>
      ) : imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className={`w-full object-cover ${compact ? "max-h-48" : "max-h-72"}`}
        />
      ) : null}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="truncate font-medium text-slate-600">{host}</span>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 group-hover:text-slate-800">
            Open ↗
          </span>
        </div>
        {title ? (
          <div className="mt-1 truncate text-sm font-semibold text-slate-900">
            {title}
          </div>
        ) : null}
        {description ? (
          <div className="mt-0.5 line-clamp-2 text-xs leading-4 text-slate-600">
            {description}
          </div>
        ) : null}
      </div>
    </a>
  );
}

// ── X (Twitter) preview ──────────────────────────────────────────────

export function XPreviewCard({
  content,
  mediaUrl,
  sourceUrl,
  sourceHost,
  handle,
}: {
  content: string | null;
  mediaUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  handle: string | null;
}) {
  const displayHandle = handle || "@you";

  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-[13px] leading-6 text-slate-900">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-9 w-9 rounded-full bg-slate-200" aria-hidden />
        <div className="flex-1">
          <div className="flex items-center gap-1">
            <span className="font-semibold">You</span>
            <span className="text-slate-500">{displayHandle}</span>
          </div>
          <span className="text-xs text-slate-500">now</span>
        </div>
      </div>
      {content ? (
        <p className="whitespace-pre-wrap">{content}</p>
      ) : (
        <p className="italic text-slate-400">No caption available yet.</p>
      )}
      {mediaUrl ? (
        <div className="mt-3 overflow-hidden rounded-[14px] border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="max-h-80 w-full object-cover"
          />
        </div>
      ) : sourceUrl ? (
        <div className="mt-3">
          <OgLinkCard
            sourceUrl={sourceUrl}
            sourceHost={sourceHost}
            imageUrl={null}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}

// ── LinkedIn preview ─────────────────────────────────────────────────

export function LinkedInPreviewCard({
  content,
  mediaUrl,
  sourceUrl,
  sourceHost,
  handle,
}: {
  content: string | null;
  mediaUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  handle: string | null;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-0 text-[13px] leading-6 text-slate-900">
      <div className="flex items-center gap-3 px-4 pt-3">
        <div className="h-10 w-10 rounded-full bg-slate-200" aria-hidden />
        <div className="flex-1">
          <div className="font-semibold">You</div>
          <div className="text-xs text-slate-500">
            {handle || "Your headline"} · now
          </div>
        </div>
      </div>
      <div className="px-4 pb-3 pt-2">
        {content ? (
          <p className="whitespace-pre-wrap">{content}</p>
        ) : (
          <p className="italic text-slate-400">No caption available yet.</p>
        )}
      </div>
      {mediaUrl ? (
        <div className="border-t border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="max-h-96 w-full object-cover"
          />
        </div>
      ) : sourceUrl ? (
        <div className="border-t border-slate-200">
          <OgLinkCard
            sourceUrl={sourceUrl}
            sourceHost={sourceHost}
            imageUrl={null}
          />
        </div>
      ) : null}
      <div className="flex items-center gap-4 border-t border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">
        <span>Like</span>
        <span>Comment</span>
        <span>Repost</span>
        <span>Send</span>
      </div>
    </div>
  );
}

// ── Generic platform preview ─────────────────────────────────────────

export function GenericPreviewCard({
  content,
  mediaUrl,
  sourceUrl,
  sourceHost,
}: {
  content: string | null;
  mediaUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white p-4 text-[13px] leading-6 text-slate-900">
      {content ? (
        <p className="whitespace-pre-wrap">{content}</p>
      ) : (
        <p className="italic text-slate-400">No caption available yet.</p>
      )}
      {mediaUrl ? (
        <div className="mt-3 overflow-hidden rounded-[14px] border border-slate-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl}
            alt=""
            className="max-h-80 w-full object-cover"
          />
        </div>
      ) : sourceUrl ? (
        <div className="mt-3">
          <OgLinkCard
            sourceUrl={sourceUrl}
            sourceHost={sourceHost}
            imageUrl={null}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}

// ── Routed preview — picks the right component by platform type ──────

export function PlatformPreview({
  type,
  content,
  mediaUrl,
  sourceUrl,
  sourceHost,
  handle,
}: {
  type: string;
  content: string | null;
  mediaUrl: string | null;
  sourceUrl: string | null;
  sourceHost: string | null;
  handle: string | null;
}) {
  const props = { content, mediaUrl, sourceUrl, sourceHost, handle };

  if (type === "x" || type === "twitter") return <XPreviewCard {...props} />;
  if (type === "linkedin") return <LinkedInPreviewCard {...props} />;
  return <GenericPreviewCard {...props} />;
}

// ── Collapsible section wrapper ──────────────────────────────────────

function platformDisplayName(type: string) {
  if (type === "x" || type === "twitter") return "X (Twitter)";
  if (type === "linkedin") return "LinkedIn";
  if (type === "instagram") return "Instagram";
  if (type === "tiktok") return "TikTok";
  if (type === "facebook") return "Facebook";
  if (type === "reddit") return "Reddit";
  if (type === "youtube") return "YouTube";
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function platformAccentClass(type: string) {
  if (type === "x" || type === "twitter") return "bg-black text-white";
  if (type === "linkedin") return "bg-[#0a66c2] text-white";
  if (type === "instagram")
    return "bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] text-white";
  if (type === "tiktok") return "bg-black text-white";
  if (type === "facebook") return "bg-[#1877f2] text-white";
  if (type === "reddit") return "bg-[#ff4500] text-white";
  if (type === "youtube") return "bg-[#ff0000] text-white";
  return "bg-slate-800 text-white";
}

function statusChipClass(status: string | null) {
  if (status === "success") return "border-emerald-300 bg-emerald-50 text-emerald-700";
  if (status === "failed") return "border-red-300 bg-red-50 text-red-700";
  if (status === "running") return "border-amber-300 bg-amber-50 text-amber-700";
  if (status === "skipped") return "border-stone-300 bg-stone-50 text-stone-600";
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function statusLabel(status: string | null) {
  if (status === "success") return "Posted";
  if (status === "failed") return "Failed";
  if (status === "running") return "Running";
  if (status === "skipped") return "Skipped";
  if (status === "planned") return "Scheduled";
  return null;
}

function FirstCommentPreview({ content }: { content: string }) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white p-3 text-[13px] leading-5 text-slate-900">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        First comment
      </div>
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}

export function CollapsiblePlatformPreview({
  data,
  fallbackContent,
  fallbackMediaUrl,
  fallbackSourceUrl,
  defaultOpen,
}: {
  data: PlatformPreviewData;
  fallbackContent: string | null;
  fallbackMediaUrl: string | null;
  fallbackSourceUrl: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const name = platformDisplayName(data.type);
  const accent = platformAccentClass(data.type);
  const sChip = statusChipClass(data.status);
  const sLabel = statusLabel(data.status);

  const content = data.content ?? fallbackContent;
  const mediaUrl = data.mediaUrl ?? fallbackMediaUrl;
  const sourceUrl = data.sourceUrl ?? fallbackSourceUrl;

  return (
    <div className="overflow-hidden rounded-[18px] border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold uppercase tracking-[0.12em] ${accent}`}
          >
            {data.shortLabel}
          </span>
          <div>
            <div className="text-sm font-semibold">{name} preview</div>
            {data.error ? (
              <div className="text-xs text-red-600">{data.error}</div>
            ) : data.publishedUrl ? (
              <div className="text-xs text-emerald-700">Published</div>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sLabel ? (
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${sChip}`}
            >
              {sLabel}
            </span>
          ) : null}
          <ChevronRight
            className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`}
          />
        </div>
      </button>
      {open ? (
        <div className="space-y-3 border-t border-slate-200 bg-slate-50/60 px-4 py-4">
          <PlatformPreview
            type={data.type}
            content={content}
            mediaUrl={mediaUrl}
            sourceUrl={sourceUrl}
            sourceHost={data.sourceHost ?? getSourceHost(sourceUrl)}
            handle={data.handle}
          />
          {data.firstComment ? (
            <FirstCommentPreview content={data.firstComment} />
          ) : null}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {data.publishedUrl ? (
              <a
                href={data.publishedUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 font-semibold text-emerald-700"
              >
                View on {name} ↗
              </a>
            ) : null}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 font-semibold text-slate-700"
              >
                Source: {getSourceHost(sourceUrl)} ↗
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
