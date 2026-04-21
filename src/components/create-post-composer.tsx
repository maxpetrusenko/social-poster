"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlatformPostPreview } from "@/components/platform-post-preview";
import { getImageDimensions, getSpecForPlatform } from "@/lib/platform-specs";

type Props = {
  profiles: { id: string; name: string }[];
  platforms: {
    id: string;
    name: string;
    handle: string | null;
    type: string;
    provider: string;
    enabled: boolean;
    capabilities: {
      canPublishText: boolean;
      canPublishImage: boolean;
      canPublishVideo: boolean;
      canPublishReply: boolean;
      canSchedule: boolean;
      source: string;
    };
  }[];
};

const BRAND_COLORS: Record<string, string> = {
  facebook: "#1877F2", instagram: "#E4405F", pinterest: "#BD081C",
  reddit: "#FF4500", tiktok: "#000000", x: "#000000", twitter: "#000000",
  youtube: "#FF0000", linkedin: "#0A66C2", linkedin_personal: "#0A66C2",
  linkedin_company: "#0A66C2", threads: "#000000", bluesky: "#0085FF",
};

const FORMAT_OPTIONS: Record<string, string[]> = {
  instagram: ["Feed", "Story", "Reel", "Carousel"],
  facebook: ["Feed", "Story", "Reel"],
};

const PUBLISH_MODES = ["schedule", "now", "queue", "draft"] as const;
type PublishMode = (typeof PUBLISH_MODES)[number];
const PUBLISH_LABELS: Record<PublishMode, string> = {
  schedule: "schedule post", now: "publish now", queue: "add to queue", draft: "save draft",
};

type PlatformOverride = { caption?: string; firstComment?: string; format?: string; collaborators?: string[] };

export function CreatePostComposer({ profiles, platforms }: Props) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [platformOverrides, setPlatformOverrides] = useState<Record<string, PlatformOverride>>({});
  const [submitting, setSubmitting] = useState(false);
  const [threadEnabled, setThreadEnabled] = useState(false);

  const selectedPlatforms = platforms.filter((p) => platformIds.includes(p.id));

  function togglePlatform(id: string) {
    setPlatformIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateOverride(platformId: string, key: keyof PlatformOverride, value: string | string[]) {
    setPlatformOverrides((prev) => ({
      ...prev, [platformId]: { ...prev[platformId], [key]: value },
    }));
  }

  function addMediaUrl() {
    const url = newMediaUrl.trim();
    if (url && !mediaUrls.includes(url)) {
      setMediaUrls((prev) => [...prev, url]);
      setNewMediaUrl("");
    }
  }

  function removeMediaUrl(idx: number) {
    setMediaUrls((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const intent = publishMode === "now" ? "publish" : publishMode === "schedule" ? "schedule" : "draft";
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content, platformIds, profileId, intent,
          scheduledAt: publishMode === "schedule" ? scheduledAt : undefined,
          mediaUrl: mediaUrls[0] || undefined,
          platformOverrides,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (intent === "publish") {
          await fetch(`/api/posts/${data.id}/publish`, { method: "POST" });
        }
        router.push(`/dashboard/posts/${data.id}`);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // Compute max images allowed across selected platforms
  const maxImagesAllowed = selectedPlatforms.reduce((min, p) => {
    const spec = getSpecForPlatform(p.type);
    return spec ? Math.min(min, spec.maxImages) : min;
  }, 20);

  return (
    <div className="min-h-screen bg-[#f5f0e6] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Create Post</h1>
            <p className="text-sm text-gray-500">create &amp; publish content</p>
          </div>
          <button onClick={() => router.push("/dashboard/posts")} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left Column */}
          <div className="space-y-5 lg:col-span-3">
            {/* Content */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">content</label>
              <div className="relative">
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="what's on your mind..." rows={6}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                <span className="absolute right-3 bottom-3 text-xs text-gray-400">{content.length} chars</span>
              </div>

              {/* Media URLs */}
              <div className="mt-3">
                {mediaUrls.length > 0 && (
                  <div className="mb-3 grid grid-cols-4 gap-2">
                    {mediaUrls.map((url, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button onClick={() => removeMediaUrl(i)}
                          className="absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {showMediaInput ? (
                  <div className="flex items-center gap-2">
                    <input type="url" value={newMediaUrl} onChange={(e) => setNewMediaUrl(e.target.value)}
                      placeholder="paste image URL..." onKeyDown={(e) => e.key === "Enter" && addMediaUrl()}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                    <button onClick={addMediaUrl} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200">Add</button>
                    <button onClick={() => { setShowMediaInput(false); setNewMediaUrl(""); }} className="text-xs text-gray-400 hover:text-gray-600">close</button>
                  </div>
                ) : (
                  <button onClick={() => setShowMediaInput(true)} className="text-sm text-gray-500 hover:text-gray-700">
                    + Add media {mediaUrls.length > 0 && `(${mediaUrls.length}${maxImagesAllowed < 20 ? `/${maxImagesAllowed}` : ""})`}
                  </button>
                )}

                {/* Image dimension hints */}
                {mediaUrls.length > 0 && selectedPlatforms.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="mb-1.5 text-xs font-medium text-amber-800">Recommended image sizes</p>
                    <div className="space-y-1">
                      {selectedPlatforms.map((p) => {
                        const override = platformOverrides[p.id];
                        const dims = getImageDimensions(p.type, override?.format);
                        if (dims.length === 0) return null;
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-[11px] text-amber-700">
                            <span className="font-medium">{p.type}:</span>
                            {dims.map((d) => (
                              <span key={d.label} className="rounded bg-amber-100 px-1.5 py-0.5">{d.width}x{d.height} ({d.aspect})</span>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Platform-specific options */}
            {selectedPlatforms.map((platform) => {
              const pType = platform.type.toLowerCase();
              const spec = getSpecForPlatform(pType);
              const formats = FORMAT_OPTIONS[pType];
              const override = platformOverrides[platform.id] || {};
              const color = BRAND_COLORS[pType] || "#6B7280";
              const charLimit = spec?.charLimit || 5000;
              const firstCommentLimit = spec?.firstCommentLimit;

              return (
                <div key={platform.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: color }}>
                      {platform.type[0].toUpperCase()}
                    </span>
                    <span className="text-sm font-medium text-gray-700">{platform.type}</span>
                    {platform.handle && <span className="text-xs text-gray-400">@{platform.handle}</span>}
                  </div>

                  {formats && (
                    <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
                      {formats.map((f) => (
                        <button key={f} onClick={() => updateOverride(platform.id, "format", f)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${(override.format || formats[0]) === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}

                  {pType === "instagram" && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-gray-500">collaborators (max 3)</label>
                      <input type="text" placeholder="@username"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = (e.target as HTMLInputElement).value.trim();
                            if (val && (override.collaborators?.length ?? 0) < 3) {
                              updateOverride(platform.id, "collaborators", [...(override.collaborators || []), val]);
                              (e.target as HTMLInputElement).value = "";
                            }
                          }
                        }} />
                      {override.collaborators?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {override.collaborators.map((c, i) => (
                            <span key={i} className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {c}
                              <button onClick={() => updateOverride(platform.id, "collaborators", override.collaborators!.filter((_, j) => j !== i))}
                                className="ml-1 text-gray-400 hover:text-gray-600">x</button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {firstCommentLimit && (
                    <div className="mb-3">
                      <label className="mb-1 block text-xs text-gray-500">first comment</label>
                      <div className="relative">
                        <textarea value={override.firstComment || ""} onChange={(e) => updateOverride(platform.id, "firstComment", e.target.value)} rows={2}
                          placeholder="Drop extra context or a CTA here."
                          className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                        <span className="absolute right-3 bottom-2 text-xs text-gray-400">{(override.firstComment || "").length}/{firstCommentLimit}</span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs text-gray-500">custom caption</label>
                    <div className="relative">
                      <textarea value={override.caption || ""} onChange={(e) => updateOverride(platform.id, "caption", e.target.value)} rows={2}
                        placeholder="Leave blank to use main content..."
                        className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                      <span className="absolute right-3 bottom-2 text-xs text-gray-400">{(override.caption || "").length}/{charLimit}</span>
                    </div>
                  </div>

                  {pType === "reddit" && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs text-gray-500">subreddit</label>
                      <input type="text" placeholder="r/subreddit"
                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                    </div>
                  )}

                  {(pType === "x" || pType === "twitter") && (
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-xs text-gray-500">thread</label>
                      <button onClick={() => setThreadEnabled(!threadEnabled)}
                        className={`relative h-5 w-9 rounded-full p-0.5 transition ${threadEnabled ? "bg-green-500" : "bg-gray-200"}`}>
                        <span className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${threadEnabled ? "translate-x-4" : "translate-x-0"}`} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Column */}
          <div className="space-y-5 lg:col-span-2">
            {/* Profiles */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <label className="mb-1 block text-sm font-medium text-gray-700">profiles</label>
              <p className="mb-3 text-xs text-gray-400">Select one or more profiles to post to their connected accounts</p>
              <select value={profileId} onChange={(e) => setProfileId(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-gray-300 focus:ring-0 focus:outline-none">
                {profiles.map((p) => <option key={p.id} value={p.id}>{p.name || "Default Profile"}</option>)}
              </select>
            </div>

            {/* Platforms */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">platforms <span className="font-normal text-gray-400">(from 1 profile)</span></label>
                <button className="text-xs text-gray-400 hover:text-gray-600">save as group</button>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {platforms.map((p) => {
                  const pType = p.type.toLowerCase();
                  const color = BRAND_COLORS[pType] || "#6B7280";
                  const selected = platformIds.includes(p.id);
                  const needsMedia = selected && mediaUrls.length === 0 && (pType === "instagram" || pType === "pinterest" || pType === "tiktok");
                  return (
                    <button key={p.id} onClick={() => togglePlatform(p.id)}
                      className={`relative rounded-lg border p-3 text-left transition ${selected ? "border-green-400 bg-green-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                      {selected && <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>}
                      {needsMedia && <span className="absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-400" title="Missing media content" />}
                      <span className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: color }}>
                        {p.type[0].toUpperCase()}
                      </span>
                      <div className="text-xs font-medium text-gray-700">{p.type}</div>
                      {p.handle && <div className="truncate text-[10px] text-gray-400">@{p.handle}</div>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <PlatformPostPreview
              content={content}
              mediaUrls={mediaUrls}
              platforms={selectedPlatforms.map((p) => ({ id: p.id, type: p.type, handle: p.handle, name: p.name }))}
              overrides={platformOverrides}
            />

            {/* Publishing */}
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <label className="mb-3 block text-sm font-medium text-gray-700">publishing</label>
              <div className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
                {PUBLISH_MODES.map((mode) => (
                  <button key={mode} onClick={() => setPublishMode(mode)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium capitalize transition ${publishMode === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                    {mode === "now" ? "Now" : mode === "schedule" ? "Schedule" : mode === "queue" ? "Queue" : "Draft"}
                  </button>
                ))}
              </div>
              {publishMode === "schedule" && (
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">date & time</label>
                    <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-gray-300 focus:ring-0 focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">timezone</label>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 focus:border-gray-300 focus:ring-0 focus:outline-none">
                      <option value="America/New_York">America/New York (EDT) (current)</option>
                      <option value="America/Chicago">America/Chicago (CDT)</option>
                      <option value="America/Denver">America/Denver (MDT)</option>
                      <option value="America/Los_Angeles">America/Los Angeles (PDT)</option>
                      <option value="UTC">UTC</option>
                      <option value="Europe/London">Europe/London (BST)</option>
                      <option value="Europe/Berlin">Europe/Berlin (CEST)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => router.push("/dashboard/posts")} className="rounded-lg px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700">cancel</button>
              <button onClick={handleSubmit} disabled={submitting || (!content && mediaUrls.length === 0) || platformIds.length === 0}
                className="rounded-lg bg-[#7a3030] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#6a2828] disabled:cursor-not-allowed disabled:opacity-50">
                {submitting ? "..." : PUBLISH_LABELS[publishMode]}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
