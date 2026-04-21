"use client";

import { useState } from "react";

type PreviewProps = {
  content: string;
  mediaUrls: string[];
  platforms: {
    id: string;
    type: string;
    handle: string | null;
    name: string;
  }[];
  overrides: Record<string, { caption?: string; format?: string }>;
};

const BRAND: Record<string, { bg: string; color: string; label: string }> = {
  instagram: { bg: "#fafafa", color: "#262626", label: "Instagram" },
  facebook: { bg: "#ffffff", color: "#1c1e21", label: "Facebook" },
  x: { bg: "#000000", color: "#e7e9ea", label: "X" },
  twitter: { bg: "#000000", color: "#e7e9ea", label: "X" },
  linkedin: { bg: "#f3f2ef", color: "#000000", label: "LinkedIn" },
  pinterest: { bg: "#ffffff", color: "#333333", label: "Pinterest" },
  tiktok: { bg: "#121212", color: "#ffffff", label: "TikTok" },
  reddit: { bg: "#1a1a1b", color: "#d7dadc", label: "Reddit" },
  youtube: { bg: "#0f0f0f", color: "#ffffff", label: "YouTube" },
  threads: { bg: "#ffffff", color: "#000000", label: "Threads" },
  bluesky: { bg: "#ffffff", color: "#000000", label: "Bluesky" },
};

function InstagramPreview({ content, mediaUrls, handle, caption }: { content: string; mediaUrls: string[]; handle: string | null; caption?: string }) {
  const text = caption || content;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600" />
        <span className="text-sm font-semibold text-[#262626]">{handle || "username"}</span>
      </div>
      {/* Image */}
      {mediaUrls.length > 0 ? (
        <div className="aspect-square bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="flex aspect-square items-center justify-center bg-gray-50 text-xs text-gray-400">No image</div>
      )}
      {/* Actions */}
      <div className="flex gap-4 px-3 py-2">
        <HeartIcon />
        <CommentIcon />
        <ShareIcon />
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm text-[#262626]">
          <span className="font-semibold">{handle || "username"}</span>{" "}
          <span className="line-clamp-3">{text || "Write a caption..."}</span>
        </p>
      </div>
    </div>
  );
}

function XPreview({ content, mediaUrls, handle, caption }: { content: string; mediaUrls: string[]; handle: string | null; caption?: string }) {
  const text = caption || content;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="flex gap-2">
        <div className="h-10 w-10 shrink-0 rounded-full bg-gray-700" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-sm font-bold text-[#e7e9ea]">{handle || "user"}</span>
            <span className="text-sm text-[#71767b]">@{handle || "user"}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-5 text-[#e7e9ea] line-clamp-6">{text || "What's happening?"}</p>
          {mediaUrls.length > 0 && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-[#2f3336]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrls[0]} alt="" className="aspect-video w-full object-cover" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FacebookPreview({ content, mediaUrls, handle, caption }: { content: string; mediaUrls: string[]; handle: string | null; caption?: string }) {
  const text = caption || content;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-[#1877F2]" />
        <div>
          <p className="text-sm font-semibold text-[#1c1e21]">{handle || "Page Name"}</p>
          <p className="text-xs text-gray-500">Just now</p>
        </div>
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-[#1c1e21] line-clamp-4">{text || "Write something..."}</p>
      </div>
      {mediaUrls.length > 0 && (
        <div className="aspect-video bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex border-t border-gray-200 px-2 py-1">
        <button className="flex-1 py-1.5 text-center text-xs font-semibold text-gray-500">Like</button>
        <button className="flex-1 py-1.5 text-center text-xs font-semibold text-gray-500">Comment</button>
        <button className="flex-1 py-1.5 text-center text-xs font-semibold text-gray-500">Share</button>
      </div>
    </div>
  );
}

function LinkedInPreview({ content, mediaUrls, handle, caption }: { content: string; mediaUrls: string[]; handle: string | null; caption?: string }) {
  const text = caption || content;
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="h-10 w-10 rounded-full bg-[#0A66C2]" />
        <div>
          <p className="text-sm font-semibold text-black">{handle || "Name"}</p>
          <p className="text-xs text-gray-500">Just now</p>
        </div>
      </div>
      <div className="px-4 pb-2">
        <p className="text-sm text-black line-clamp-4">{text || "Share an update..."}</p>
      </div>
      {mediaUrls.length > 0 && (
        <div className="aspect-video bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}

function GenericPreview({ content, mediaUrls, handle, platformType, caption }: { content: string; mediaUrls: string[]; handle: string | null; platformType: string; caption?: string }) {
  const text = caption || content;
  const brand = BRAND[platformType] || { bg: "#ffffff", color: "#000000", label: platformType };
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200" style={{ backgroundColor: brand.bg }}>
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="h-8 w-8 rounded-full bg-gray-400" />
        <span className="text-sm font-semibold" style={{ color: brand.color }}>{handle || brand.label}</span>
      </div>
      <div className="px-4 pb-3">
        <p className="text-sm line-clamp-4" style={{ color: brand.color }}>{text || "Post content..."}</p>
      </div>
      {mediaUrls.length > 0 && (
        <div className="aspect-video bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      )}
    </div>
  );
}

export function PlatformPostPreview({ content, mediaUrls, platforms, overrides }: PreviewProps) {
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
  const pType = platform.type.toLowerCase();
  const override = overrides[platform.id] || {};
  const caption = override.caption || undefined;

  const previewProps = { content, mediaUrls, handle: platform.handle, caption };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm font-medium text-gray-700 mb-3">preview</p>

      {/* Platform tabs */}
      {platforms.length > 1 && (
        <div className="mb-3 flex gap-1 overflow-x-auto">
          {platforms.map((p, i) => {
            const brand = BRAND[p.type.toLowerCase()];
            return (
              <button
                key={p.id}
                onClick={() => setActiveIdx(i)}
                className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  i === activeIdx ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {brand?.label || p.type}
              </button>
            );
          })}
        </div>
      )}

      {/* Render platform-specific preview */}
      <div className="max-w-[320px]">
        {pType === "instagram" || pType === "instagram_personal" ? (
          <InstagramPreview {...previewProps} />
        ) : pType === "x" || pType === "twitter" ? (
          <XPreview {...previewProps} />
        ) : pType === "facebook" ? (
          <FacebookPreview {...previewProps} />
        ) : pType === "linkedin" || pType === "linkedin_personal" || pType === "linkedin_company" ? (
          <LinkedInPreview {...previewProps} />
        ) : (
          <GenericPreview {...previewProps} platformType={pType} />
        )}
      </div>
    </div>
  );
}

// Tiny SVG icons for the Instagram preview
function HeartIcon() {
  return (
    <svg className="h-5 w-5 text-[#262626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
function CommentIcon() {
  return (
    <svg className="h-5 w-5 text-[#262626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
function ShareIcon() {
  return (
    <svg className="h-5 w-5 text-[#262626]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}
