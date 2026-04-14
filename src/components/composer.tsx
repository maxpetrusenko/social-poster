"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlatformType } from "@/lib/platforms";

/* -------------------------------------------------------------------------- */
/*  Platform metadata (icons, colors, char limits, formats)                   */
/* -------------------------------------------------------------------------- */

const PLATFORM_META: Record<
  PlatformType,
  {
    icon: string;
    accent: string;
    accentBg: string;
    charLimit: number;
    formats: string[];
  }
> = {
  twitter: {
    icon: "𝕏",
    accent: "#0f1419",
    accentBg: "rgba(15,20,25,0.08)",
    charLimit: 280,
    formats: ["Post", "Thread"],
  },
  linkedin: {
    icon: "in",
    accent: "#0a66c2",
    accentBg: "rgba(10,102,194,0.08)",
    charLimit: 3000,
    formats: ["Post", "Article"],
  },
  instagram: {
    icon: "IG",
    accent: "#e1306c",
    accentBg: "rgba(225,48,108,0.08)",
    charLimit: 2200,
    formats: ["Post", "Story", "Reel", "Carousel"],
  },
  tiktok: {
    icon: "TT",
    accent: "#010101",
    accentBg: "rgba(1,1,1,0.08)",
    charLimit: 2200,
    formats: ["Video", "Photo"],
  },
  facebook: {
    icon: "fb",
    accent: "#1877f2",
    accentBg: "rgba(24,119,242,0.08)",
    charLimit: 63206,
    formats: ["Post", "Story", "Reel"],
  },
  reddit: {
    icon: "R",
    accent: "#ff4500",
    accentBg: "rgba(255,69,0,0.08)",
    charLimit: 40000,
    formats: ["Post", "Link"],
  },
  pinterest: {
    icon: "P",
    accent: "#e60023",
    accentBg: "rgba(230,0,35,0.08)",
    charLimit: 500,
    formats: ["Pin", "Idea Pin"],
  },
  youtube: {
    icon: "YT",
    accent: "#ff0000",
    accentBg: "rgba(255,0,0,0.08)",
    charLimit: 5000,
    formats: ["Video", "Short"],
  },
};

function getLowestCharLimit(types: PlatformType[]): number {
  if (types.length === 0) return 5000;
  return Math.min(...types.map((t) => PLATFORM_META[t].charLimit));
}

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

type ComposerPlatform = {
  id: string;
  name: string;
  type: PlatformType;
  handle: string | null;
  enabled: boolean;
};

type ComposerProfile = {
  id: string;
  name: string;
};

type ComposerProps = {
  platforms: ComposerPlatform[];
  profiles: ComposerProfile[];
  initialValues?: {
    title?: string;
    content?: string;
    contentType?: string;
    sourceUrl?: string;
    mediaUrl?: string;
  };
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function Composer({ platforms, profiles, initialValues }: ComposerProps) {
  const router = useRouter();

  const [form, setForm] = useState({
    title: initialValues?.title || "",
    content: initialValues?.content || "",
    contentType: initialValues?.contentType || "text",
    sourceUrl: initialValues?.sourceUrl || "",
    mediaUrl: initialValues?.mediaUrl || "",
    scheduledAt: "",
    profileId: "",
    selectedPlatformIds: [] as string[],
    selectedFormat: "" as string,
  });

  const [submitting, setSubmitting] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  /* Derived --------------------------------------------------------------- */

  const selectedPlatforms = platforms.filter((p) =>
    form.selectedPlatformIds.includes(p.id),
  );
  const selectedTypes = Array.from(
    new Set(selectedPlatforms.map((p) => p.type)),
  );
  const isSingleType = selectedTypes.length === 1;
  const formats = isSingleType ? PLATFORM_META[selectedTypes[0]].formats : [];
  const charLimit = getLowestCharLimit(selectedTypes);
  const charCount = form.content.length;
  const overLimit = charCount > charLimit;

  const mediaPreviewUrl = form.mediaUrl
    ? `/api/og-image?${new URLSearchParams({ url: form.mediaUrl }).toString()}`
    : "";

  /* Helpers --------------------------------------------------------------- */

  function update(patch: Partial<typeof form>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function togglePlatform(id: string) {
    setForm((prev) => {
      const next = prev.selectedPlatformIds.includes(id)
        ? prev.selectedPlatformIds.filter((pid) => pid !== id)
        : [...prev.selectedPlatformIds, id];
      return { ...prev, selectedPlatformIds: next, selectedFormat: "" };
    });
  }

  /* Submit ---------------------------------------------------------------- */

  async function handleSubmit(action: "draft" | "schedule" | "publish") {
    if (action === "publish" && !confirmPublish) {
      setConfirmPublish(true);
      return;
    }

    setSubmitting(action);
    setConfirmPublish(false);

    try {
      const payload: Record<string, unknown> = {
        title: form.title || undefined,
        content: form.content,
        contentType: form.contentType,
        sourceUrl: form.sourceUrl || undefined,
        mediaUrl: form.mediaUrl || undefined,
        profileId: form.profileId || undefined,
        platformIds: form.selectedPlatformIds,
      };

      if (action === "schedule" && form.scheduledAt) {
        payload.scheduledAt = form.scheduledAt;
      }

      if (action === "publish") {
        payload.action = "publish_now";
      }

      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to create post");
        return;
      }

      const result = await res.json();
      router.push(`/dashboard/posts/${result.id}`);
    } catch (err) {
      console.error("Error creating post:", err);
      alert("Failed to create post");
    } finally {
      setSubmitting(null);
    }
  }

  /* Render ---------------------------------------------------------------- */

  const inputCls =
    "w-full rounded-[10px] border border-[var(--line)] bg-white px-3 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[rgba(15,126,169,0.3)] focus:border-[var(--accent-tech)] transition-colors";

  return (
    <div className="w-full space-y-5">
      {/* ------------------------------------------------------------------ */}
      {/*  Channel Picker                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--ink)]">
          Channels
        </label>
        <div className="flex flex-wrap gap-2">
          {platforms.map((p) => {
            const meta = PLATFORM_META[p.type];
            const selected = form.selectedPlatformIds.includes(p.id);

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => togglePlatform(p.id)}
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors"
                style={
                  selected
                    ? {
                        borderColor: meta.accent,
                        backgroundColor: meta.accentBg,
                        color: meta.accent,
                      }
                    : {
                        borderColor: "var(--line)",
                        backgroundColor: "white",
                        color: "var(--muted)",
                      }
                }
              >
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold leading-none">
                  {meta.icon}
                </span>
                <span>
                  {p.name}
                  {p.handle ? (
                    <span className="ml-1 font-normal opacity-60">
                      {p.handle}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Format Picker                                                     */}
      {/* ------------------------------------------------------------------ */}
      {selectedPlatforms.length > 0 && (
        <div>
          {isSingleType ? (
            <div className="flex flex-wrap gap-1.5">
              {formats.map((fmt) => {
                const active = form.selectedFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() =>
                      update({ selectedFormat: active ? "" : fmt })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[var(--accent-tech)] text-white"
                        : "bg-[rgba(12,17,21,0.05)] text-[var(--muted)] hover:bg-[rgba(12,17,21,0.09)]"
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          ) : (
            <span className="text-xs font-semibold text-[var(--muted)]">
              Multi-channel
            </span>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  Composer Card                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-white p-5 space-y-4">
        {/* Title */}
        <div>
          <label
            htmlFor="composer-title"
            className="mb-1 block text-sm font-medium text-[var(--ink)]"
          >
            Title{" "}
            <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input
            id="composer-title"
            type="text"
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Post title"
            className={inputCls}
          />
        </div>

        {/* Content */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label
              htmlFor="composer-content"
              className="text-sm font-medium text-[var(--ink)]"
            >
              Content
            </label>
            <span
              className={`text-xs tabular-nums ${
                overLimit
                  ? "font-semibold text-red-500"
                  : "text-[var(--muted)]"
              }`}
            >
              {charCount}/{charLimit}
            </span>
          </div>
          <textarea
            id="composer-content"
            value={form.content}
            onChange={(e) => update({ content: e.target.value })}
            placeholder="Write your post..."
            rows={6}
            required
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* Content Type */}
        <div>
          <label
            htmlFor="composer-contentType"
            className="mb-1 block text-sm font-medium text-[var(--ink)]"
          >
            Content Type
          </label>
          <select
            id="composer-contentType"
            value={form.contentType}
            onChange={(e) => update({ contentType: e.target.value })}
            className={inputCls}
          >
            <option value="text">Text</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="avatar_video">Avatar Video</option>
          </select>
        </div>

        {/* Media */}
        <div>
          <label
            htmlFor="composer-media"
            className="mb-1 block text-sm font-medium text-[var(--ink)]"
          >
            Media URL{" "}
            <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input
            id="composer-media"
            type="url"
            value={form.mediaUrl}
            onChange={(e) => update({ mediaUrl: e.target.value })}
            placeholder="https://example.com/image.jpg"
            className={inputCls}
          />
          {form.selectedFormat && isSingleType && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {["Post", "Pin", "Photo", "Carousel"].includes(
                form.selectedFormat,
              )
                ? "Image or video recommended"
                : ["Story", "Reel", "Video", "Short"].includes(
                      form.selectedFormat,
                    )
                  ? "Video required"
                  : null}
            </p>
          )}
          {form.mediaUrl && (
            <div className="mt-2 overflow-hidden rounded-[10px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mediaPreviewUrl}
                alt="Media preview"
                className="h-48 w-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Source URL */}
        <div>
          <label
            htmlFor="composer-source"
            className="mb-1 block text-sm font-medium text-[var(--ink)]"
          >
            Source URL{" "}
            <span className="font-normal text-[var(--muted)]">(optional)</span>
          </label>
          <input
            id="composer-source"
            type="url"
            value={form.sourceUrl}
            onChange={(e) => update({ sourceUrl: e.target.value })}
            placeholder="https://example.com/article"
            className={inputCls}
          />
        </div>

        {/* Profile */}
        {profiles.length > 0 && (
          <div>
            <label
              htmlFor="composer-profile"
              className="mb-1 block text-sm font-medium text-[var(--ink)]"
            >
              Profile
            </label>
            <select
              id="composer-profile"
              value={form.profileId}
              onChange={(e) => update({ profileId: e.target.value })}
              className={inputCls}
            >
              <option value="">Select a profile</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Schedule */}
        {showSchedule && (
          <div>
            <label
              htmlFor="composer-schedule"
              className="mb-1 block text-sm font-medium text-[var(--ink)]"
            >
              Schedule
            </label>
            <input
              id="composer-schedule"
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(e) => update({ scheduledAt: e.target.value })}
              className={inputCls}
            />
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/*  Action Footer                                                     */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Save Draft */}
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => handleSubmit("draft")}
          className="rounded-[10px] border border-[var(--line)] bg-white px-5 py-2.5 text-sm font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--paper)] disabled:opacity-50"
        >
          {submitting === "draft" ? "Saving..." : "Save Draft"}
        </button>

        {/* Schedule */}
        <button
          type="button"
          disabled={submitting !== null}
          onClick={() => {
            if (!showSchedule || !form.scheduledAt) {
              setShowSchedule(true);
              return;
            }
            handleSubmit("schedule");
          }}
          className={`rounded-[10px] px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
            form.scheduledAt && showSchedule
              ? "bg-[var(--accent-tech)] hover:opacity-90"
              : "bg-[var(--accent-tech)]/60 hover:bg-[var(--accent-tech)]/80"
          }`}
        >
          {submitting === "schedule"
            ? "Scheduling..."
            : !showSchedule
              ? "Schedule"
              : form.scheduledAt
                ? "Schedule"
                : "Pick a time..."}
        </button>

        {/* Publish Now */}
        {confirmPublish ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting !== null}
              onClick={() => handleSubmit("publish")}
              className="rounded-[10px] bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
              {submitting === "publish" ? "Publishing..." : "Confirm Publish"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmPublish(false)}
              className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleSubmit("publish")}
            className="rounded-[10px] bg-[var(--ink)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            Publish Now
          </button>
        )}
      </div>
    </div>
  );
}
