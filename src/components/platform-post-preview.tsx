"use client";

import { useState } from "react";
import {
  BarChart3,
  Bookmark,
  Link2,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Repeat2,
  Send,
  Share,
  ThumbsUp,
} from "lucide-react";
import { PlatformBrandBadge } from "@/components/dashboard/platform-brand-icon";
import {
  cleanUrlHost,
  humanizeFormatLabel,
  parseThreadChunks,
  shouldRenderSourceLinkCard,
  shouldRenderThread,
} from "@/components/platform-post-preview-helpers";
import { getPlatformMeta, normalizePlatformType } from "@/lib/dashboard/platforms";
import { normalizePreviewMediaUrls } from "@/lib/dashboard/platform-preview-media";
import type { ImageSpec } from "@/lib/platform-specs";
import { cn } from "@/lib/utils";

type PreviewProps = {
  content: string;
  mediaUrls: string[];
  sourceUrl?: string | null;
  platforms: {
    id: string;
    type: string;
    handle: string | null;
    name: string;
  }[];
  overrides: Record<string, { caption?: string; format?: string }>;
  previewSpecs?: Record<string, ImageSpec>;
  threadEnabled?: boolean;
};

export type PlatformPostPreviewCardProps = {
  type: string;
  content: string | null;
  mediaUrls?: string[];
  sourceUrl?: string | null;
  handle: string | null;
  name?: string | null;
  caption?: string | null;
  format?: string | null;
  previewSpec?: ImageSpec | null;
  threadEnabled?: boolean;
  className?: string;
};

type ResolvedPlatformPostPreviewCardProps = Omit<
  PlatformPostPreviewCardProps,
  "mediaUrls"
> & {
  mediaUrls: string[];
  platformType: string;
  sourceUrl: string | null;
};

function isVideoMediaUrl(url: string) {
  return /\.(mp4|mov|webm)(\?|#|$)/i.test(url);
}

function MediaPreview({ url, className }: { url: string; className: string }) {
  return isVideoMediaUrl(url) ? (
    <video src={url} className={className} muted playsInline />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className={className} />
  );
}

function cleanHandle(handle: string | null | undefined) {
  return (handle || "").trim().replace(/^@+/, "");
}

function FormatBadge({
  label,
  dark = false,
}: {
  label: string | null;
  dark?: boolean;
}) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        dark ? "bg-[#1d9bf0]/12 text-[#1d9bf0]" : "bg-gray-100 text-gray-600"
      )}
    >
      {label}
    </span>
  );
}

function SourceLinkCard({
  sourceUrl,
  dark = false,
}: {
  sourceUrl: string | null;
  dark?: boolean;
}) {
  if (!sourceUrl) return null;
  const host = cleanUrlHost(sourceUrl) ?? sourceUrl;

  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-[14px] border",
        dark ? "border-[#2f3336] bg-[#0f1419]" : "border-gray-200 bg-gray-50"
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
            dark ? "bg-[#1d9bf0]/12 text-[#1d9bf0]" : "bg-white text-gray-500"
          )}
        >
          <Link2 className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold", dark ? "text-[#e7e9ea]" : "text-gray-900")}>
            Link preview
          </p>
          <p className={cn("truncate text-xs", dark ? "text-[#71767b]" : "text-gray-500")}>
            {host}
          </p>
        </div>
      </div>
    </div>
  );
}

function displayHandle(handle: string | null | undefined, fallback = "you") {
  const cleaned = cleanHandle(handle);
  return cleaned ? `@${cleaned}` : `@${fallback}`;
}

function displayName(name: string | null | undefined, handle: string | null | undefined, fallback: string) {
  const cleaned = cleanHandle(handle);
  if (name && name.trim()) return name.trim();
  if (cleaned) return cleaned;
  return fallback;
}

function previewText(content: string | null, caption?: string | null, fallback = "Write the post...") {
  const text = caption?.trim() || content?.trim();
  return text || fallback;
}

function MediaTile({
  url,
  className,
  overlay,
}: {
  url: string;
  className?: string;
  overlay?: string | null;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gray-100">
      <MediaPreview url={url} className={cn("h-full w-full object-cover", className)} />
      {overlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-semibold text-white">
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

function NativeMediaGrid({
  mediaUrls,
  dark = false,
  className,
  previewSpec,
}: {
  mediaUrls: string[];
  dark?: boolean;
  className?: string;
  previewSpec?: ImageSpec | null;
}) {
  const { visibleMediaUrls: urls, extraCount } = normalizePreviewMediaUrls(mediaUrls);
  if (urls.length === 0) return null;

  const borderClass = dark ? "border-[#2f3336]" : "border-gray-200";
  const overlay = extraCount > 0 ? `+${extraCount}` : null;

  if (urls.length === 1) {
    return (
      <div
        className={cn("mt-3 overflow-hidden rounded-[16px] border", borderClass, className)}
        style={previewSpec ? { aspectRatio: `${previewSpec.width} / ${previewSpec.height}` } : undefined}
      >
        <MediaPreview
          url={urls[0]}
          className={cn(
            "w-full bg-white",
            previewSpec ? "h-full object-contain" : "aspect-video object-cover"
          )}
        />
      </div>
    );
  }

  if (urls.length === 2) {
    return (
      <div className={cn("mt-3 grid aspect-[2/1] grid-cols-2 gap-px overflow-hidden rounded-[16px] border", borderClass, className)}>
        {urls.map((url, index) => (
          <MediaTile key={url} url={url} overlay={index === 1 ? overlay : null} />
        ))}
      </div>
    );
  }

  if (urls.length === 3) {
    return (
      <div className={cn("mt-3 grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-[16px] border", borderClass, className)}>
        <div className="row-span-2">
          <MediaTile url={urls[0]} />
        </div>
        <MediaTile url={urls[1]} />
        <MediaTile url={urls[2]} overlay={overlay} />
      </div>
    );
  }

  return (
    <div className={cn("mt-3 grid aspect-[2/1] grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-[16px] border", borderClass, className)}>
      {urls.map((url, index) => (
        <MediaTile key={url} url={url} overlay={index === 3 ? overlay : null} />
      ))}
    </div>
  );
}

function InstagramMedia({
  mediaUrls,
  format,
  previewSpec,
}: {
  mediaUrls: string[];
  format?: string | null;
  previewSpec?: ImageSpec | null;
}) {
  const previewStyle = previewSpec
    ? { aspectRatio: `${previewSpec.width} / ${previewSpec.height}` }
    : undefined;

  if (mediaUrls.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gray-50 text-xs text-gray-400",
          previewSpec ? "max-h-[540px]" : "aspect-square"
        )}
        style={previewStyle}
      >
        No image
      </div>
    );
  }

  const vertical = ["story", "reel"].includes((format || "").toLowerCase());
  const frameClass = vertical ? "aspect-[9/16] max-h-[520px]" : "aspect-square";

  return (
    <div>
      <div
        className={cn("relative", previewSpec ? "max-h-[540px] bg-white" : `${frameClass} bg-gray-100`)}
        style={previewStyle}
      >
        <MediaPreview
          url={mediaUrls[0]}
          className={cn("h-full w-full", previewSpec ? "object-contain" : "object-cover")}
        />
        {mediaUrls.length > 1 ? (
          <div className="absolute right-3 top-3 rounded-full bg-black/70 px-2 py-1 text-[11px] font-semibold text-white">
            1/{mediaUrls.length}
          </div>
        ) : null}
      </div>
      {mediaUrls.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto border-t border-gray-100 bg-white px-3 py-2">
          {mediaUrls.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className={cn(
                "h-11 w-11 shrink-0 overflow-hidden rounded border",
                index === 0 ? "border-[#262626]" : "border-gray-200"
              )}
            >
              <MediaPreview url={url} className="h-full w-full object-cover" />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function InstagramPreview({ content, mediaUrls, handle, caption, platformType, name, format, previewSpec, sourceUrl }: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "Write a caption...");
  const user = displayName(name, handle, "username");
  const formatLabel = humanizeFormatLabel(format);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <PlatformBrandBadge type={platformType} className="h-8 w-8" />
          <span className="text-sm font-semibold text-[#262626]">{user}</span>
        </div>
        <FormatBadge label={formatLabel} />
      </div>
      <InstagramMedia mediaUrls={mediaUrls} format={format} previewSpec={previewSpec} />
      <div className="flex items-center justify-between px-3 py-2 text-[#262626]">
        <div className="flex gap-4">
          <Heart className="h-5 w-5" />
          <MessageCircle className="h-5 w-5" />
          <Send className="h-5 w-5" />
        </div>
        <Bookmark className="h-5 w-5" />
      </div>
      <div className="px-3 pb-3">
        <p className="text-sm text-[#262626]">
          <span className="font-semibold">{user}</span>{" "}
          <span className="line-clamp-3">{text || "Write a caption..."}</span>
        </p>
      </div>
      <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} />
    </div>
  );
}

function XThreadPost({
  name,
  handle,
  text,
  mediaUrls,
  sourceUrl,
  previewSpec,
  index,
  total,
}: {
  name: string | null | undefined;
  handle: string | null;
  text: string;
  mediaUrls: string[];
  sourceUrl: string | null;
  previewSpec?: ImageSpec | null;
  index: number;
  total: number;
}) {
  const user = displayName(name, handle, "You");
  const isFirst = index === 0;

  return (
    <div className="rounded-[16px] border border-[#2f3336] bg-[#0b0d10] p-3">
      <div className="flex gap-3">
        <PlatformBrandBadge type="x" className="h-10 w-10 border-[#2f3336] bg-[#16181c]" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-[13px] leading-5">
            <span className="truncate font-bold text-[#e7e9ea]">{user}</span>
            <span className="truncate text-[#71767b]">{displayHandle(handle)}</span>
            <span className="text-[#71767b]">· now</span>
            <span className="ml-auto rounded-full border border-[#2f3336] bg-[#111418] px-2 py-0.5 text-[11px] font-semibold text-[#e7e9ea]">
              {index + 1}/{total}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-5 text-[#e7e9ea] line-clamp-8">{text}</p>
          {isFirst ? (
            <>
              <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} dark />
              <NativeMediaGrid mediaUrls={mediaUrls} dark previewSpec={previewSpec} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function XPreview({
  content,
  mediaUrls,
  handle,
  caption,
  platformType,
  name,
  previewSpec,
  format,
  sourceUrl,
  threadEnabled,
}: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "What's happening?");
  const formatLabel = humanizeFormatLabel(format);
  const threadChunks = shouldRenderThread({ content, format, threadEnabled })
    ? parseThreadChunks(content) ?? [text]
    : null;

  if (threadChunks) {
    return (
      <div className="overflow-hidden rounded-[18px] border border-[#2f3336] bg-black p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <PlatformBrandBadge type={platformType} className="h-10 w-10 border-[#2f3336] bg-[#16181c]" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1 text-[13px] leading-5">
                <span className="truncate font-bold text-[#e7e9ea]">{displayName(name, handle, "You")}</span>
                <span className="truncate text-[#71767b]">{displayHandle(handle)}</span>
                <span className="text-[#71767b]">· now</span>
              </div>
              <FormatBadge label="Thread" dark />
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-[#71767b]" />
        </div>
        <div className="space-y-2">
          {threadChunks.map((chunk, index) => (
            <XThreadPost
              key={`${index}-${chunk.slice(0, 24)}`}
              name={name}
              handle={handle}
              text={chunk}
              mediaUrls={mediaUrls}
              sourceUrl={sourceUrl}
              previewSpec={previewSpec}
              index={index}
              total={threadChunks.length}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[18px] border border-[#2f3336] bg-black p-3">
      <div className="flex gap-3">
        <PlatformBrandBadge type={platformType} className="h-10 w-10 border-[#2f3336] bg-[#16181c]" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1 text-[13px] leading-5">
            <span className="truncate font-bold text-[#e7e9ea]">{displayName(name, handle, "You")}</span>
            <span className="truncate text-[#71767b]">{displayHandle(handle)}</span>
            <span className="text-[#71767b]">· now</span>
            <FormatBadge label={formatLabel} dark />
            <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 text-[#71767b]" />
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-5 text-[#e7e9ea] line-clamp-8">{text}</p>
          <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} dark />
          <NativeMediaGrid mediaUrls={mediaUrls} dark previewSpec={previewSpec} />
          <div className="mt-3 flex items-center justify-between pr-2 text-[#71767b]">
            <MessageCircle className="h-[18px] w-[18px]" />
            <Repeat2 className="h-[18px] w-[18px]" />
            <Heart className="h-[18px] w-[18px]" />
            <BarChart3 className="h-[18px] w-[18px]" />
            <Bookmark className="h-[18px] w-[18px]" />
            <Share className="h-[18px] w-[18px]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookPreview({ content, mediaUrls, handle, caption, platformType, name, previewSpec, format, sourceUrl }: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "Write something...");
  const formatLabel = humanizeFormatLabel(format);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <PlatformBrandBadge type={platformType} className="h-10 w-10" />
          <div>
            <p className="text-sm font-semibold text-[#1c1e21]">{displayName(name, handle, "Page Name")}</p>
            <p className="text-xs text-gray-500">Just now</p>
          </div>
        </div>
        <FormatBadge label={formatLabel} />
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-[#1c1e21] line-clamp-5">{text}</p>
      </div>
      <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} />
      <NativeMediaGrid mediaUrls={mediaUrls} className="mt-0 rounded-none border-x-0" previewSpec={previewSpec} />
      <div className="flex border-t border-gray-200 px-2 py-1">
        <button className="inline-flex flex-1 items-center justify-center gap-1 py-1.5 text-center text-xs font-semibold text-gray-500">
          <ThumbsUp className="h-3.5 w-3.5" /> Like
        </button>
        <button className="inline-flex flex-1 items-center justify-center gap-1 py-1.5 text-center text-xs font-semibold text-gray-500">
          <MessageCircle className="h-3.5 w-3.5" /> Comment
        </button>
        <button className="inline-flex flex-1 items-center justify-center gap-1 py-1.5 text-center text-xs font-semibold text-gray-500">
          <Share className="h-3.5 w-3.5" /> Share
        </button>
      </div>
    </div>
  );
}

function LinkedInPreview({ content, mediaUrls, handle, caption, platformType, name, previewSpec, format, sourceUrl }: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "Share an update...");
  const formatLabel = humanizeFormatLabel(format);
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <PlatformBrandBadge type={platformType} className="h-10 w-10" />
          <div>
            <p className="text-sm font-semibold text-black">{displayName(name, handle, "Name")}</p>
            <p className="text-xs text-gray-500">{displayHandle(handle, "profile")} · now</p>
          </div>
        </div>
        <FormatBadge label={formatLabel} />
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-black line-clamp-6">{text}</p>
      </div>
      <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} />
      <NativeMediaGrid mediaUrls={mediaUrls} className="mt-0 rounded-none border-x-0" previewSpec={previewSpec} />
      <div className="flex items-center gap-4 border-t border-gray-200 px-4 py-2 text-xs font-semibold text-gray-500">
        <span>Like</span>
        <span>Comment</span>
        <span>Repost</span>
        <span>Send</span>
      </div>
    </div>
  );
}

function VerticalVideoPreview({ content, mediaUrls, handle, caption, platformType, name, previewSpec, format, sourceUrl }: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "Add a caption...");
  const meta = getPlatformMeta(platformType);
  const formatLabel = humanizeFormatLabel(format);

  return (
    <div className="overflow-hidden rounded-[20px] border border-gray-900 bg-[#050505] text-white">
      <div
        className={cn("relative max-h-[540px]", previewSpec ? "bg-white" : "aspect-[9/16] bg-[#111]")}
        style={previewSpec ? { aspectRatio: `${previewSpec.width} / ${previewSpec.height}` } : undefined}
      >
        {mediaUrls[0] ? (
          <MediaPreview
            url={mediaUrls[0]}
            className={cn("h-full w-full", previewSpec ? "object-contain" : "object-cover")}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-white/45">No video</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <PlatformBrandBadge type={platformType} label={meta.label} className="h-8 w-8 border-white/20 bg-white/10 text-white" iconClassName="h-4 w-4" />
              <span className="text-sm font-semibold">{displayName(name, handle, meta.label)}</span>
            </div>
            <FormatBadge label={formatLabel} dark />
          </div>
          <p className="line-clamp-3 text-sm leading-5 text-white/90">{text}</p>
          <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} dark />
          {mediaUrls.length > 1 ? (
            <div className="mt-2 text-[11px] font-semibold text-white/70">
              {mediaUrls.length} media attached
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GenericPreview({ content, mediaUrls, handle, platformType, caption, name, previewSpec, format, sourceUrl }: ResolvedPlatformPostPreviewCardProps) {
  const text = previewText(content, caption, "Post content...");
  const meta = getPlatformMeta(platformType);
  const formatLabel = humanizeFormatLabel(format);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <PlatformBrandBadge type={platformType} label={meta.label} className="h-8 w-8" />
          <div>
            <p className="text-sm font-semibold text-gray-950">{displayName(name, handle, meta.label)}</p>
            <p className="text-xs text-gray-500">{meta.label} preview</p>
          </div>
        </div>
        <FormatBadge label={formatLabel} />
      </div>
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-900 line-clamp-5">{text}</p>
      </div>
      <SourceLinkCard sourceUrl={shouldRenderSourceLinkCard({ sourceUrl, mediaUrls }) ? sourceUrl : null} />
      <NativeMediaGrid mediaUrls={mediaUrls} className="mt-0 rounded-none border-x-0" previewSpec={previewSpec} />
    </div>
  );
}

export function PlatformPostPreviewCard({
  type,
  content,
  mediaUrls = [],
  sourceUrl = null,
  handle,
  name,
  caption,
  format,
  threadEnabled,
  previewSpec,
  className,
}: PlatformPostPreviewCardProps) {
  const platformType = normalizePlatformType(type);
  const props = {
    type,
    content,
    mediaUrls: normalizePreviewMediaUrls(mediaUrls).allMediaUrls,
    handle,
    name,
    caption,
    format,
    sourceUrl,
    threadEnabled,
    previewSpec,
    platformType,
  };

  const card = (() => {
    const normalizedFormat = format?.toLowerCase();
    if (
      (platformType === "instagram" || platformType === "instagram_personal") &&
      (normalizedFormat === "story" || normalizedFormat === "reel")
    ) {
      return <VerticalVideoPreview {...props} />;
    }
    if (platformType === "facebook" && (normalizedFormat === "story" || normalizedFormat === "reel")) {
      return <VerticalVideoPreview {...props} />;
    }
    if (platformType === "instagram" || platformType === "instagram_personal") return <InstagramPreview {...props} />;
    if (platformType === "x" || platformType === "twitter") return <XPreview {...props} />;
    if (platformType === "facebook") return <FacebookPreview {...props} />;
    if (platformType === "linkedin" || platformType === "linkedin_personal" || platformType === "linkedin_company") return <LinkedInPreview {...props} />;
    if (platformType === "tiktok" || platformType === "youtube") return <VerticalVideoPreview {...props} />;
    return <GenericPreview {...props} />;
  })();

  return <div className={className}>{card}</div>;
}

export function PlatformPostPreview({ content, mediaUrls, sourceUrl = null, platforms, overrides, previewSpecs = {}, threadEnabled = false }: PreviewProps) {
  const [activeIdx, setActiveIdx] = useState(0);

  if (platforms.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <p className="text-sm font-medium text-gray-700 mb-3">preview</p>
        <div className="rounded-lg border border-dashed border-gray-200 p-8 text-center">
          <p className="text-xs text-gray-400">Select a platform to see preview</p>
        </div>
      </div>
    );
  }

  const platform = platforms[activeIdx] || platforms[0];
  const pType = normalizePlatformType(platform.type);
  const override = overrides[platform.id] || {};
  const caption = override.caption || undefined;
  const previewSpec = previewSpecs[platform.id] ?? null;
  const selectedFormat = override.format || undefined;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-gray-700">preview</p>
        {previewSpec ? (
          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-500">
            {previewSpec.width}x{previewSpec.height}
          </span>
        ) : null}
      </div>

      {/* Platform tabs */}
      {platforms.length > 1 && (
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {platforms.map((p, i) => {
            const meta = getPlatformMeta(p.type);
            return (
              <button
                key={p.id}
                onClick={() => setActiveIdx(i)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  i === activeIdx ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <PlatformBrandBadge type={p.type} label={meta.label} className="h-5 w-5 border-white/20 bg-white/10" iconClassName="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Render platform-specific preview */}
      <div className="max-w-[380px]">
        <PlatformPostPreviewCard
          type={pType}
          content={content}
          mediaUrls={mediaUrls}
          sourceUrl={sourceUrl}
          handle={platform.handle}
          name={platform.name}
          caption={caption}
          format={selectedFormat}
          threadEnabled={threadEnabled}
          previewSpec={previewSpec}
        />
      </div>
    </div>
  );
}
