"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FileText,
  ImageIcon,
  Layers3,
  Send,
  Sparkles,
  Video,
} from "lucide-react";
import { StatusBadge } from "@/components/dashboard/ui";
import { PlatformPostPreview } from "@/components/platform-post-preview";
import type {
  ComposerInitialValues,
  ComposerPlatform,
  ComposerProfile,
} from "@/lib/dashboard/composer";
import { cn } from "@/lib/utils";

type ComposerIntent = "draft" | "schedule" | "publish";

const contentTypeOptions = [
  {
    value: "text",
    label: "Text",
    description: "Fast thought, update, or source reaction.",
    Icon: FileText,
  },
  {
    value: "image",
    label: "Image",
    description: "Static visual, chart, screenshot, or OG asset.",
    Icon: ImageIcon,
  },
  {
    value: "video",
    label: "Video",
    description: "Native upload, clip, or screen demo.",
    Icon: Video,
  },
  {
    value: "avatar_video",
    label: "Avatar Video",
    description: "Talking-head render path using the profile face + voice.",
    Icon: Sparkles,
  },
] as const;

function formatScheduledPreview(value: string) {
  if (!value) return "No slot selected";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid slot";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getMediaKind(contentType: string) {
  if (contentType === "image") return "image";
  if (contentType === "video" || contentType === "avatar_video") return "video";
  return "text";
}

export function NewPostForm({
  profiles,
  platforms,
  initialValues,
  submitLabel = "Save Draft",
  postId,
}: {
  profiles: ComposerProfile[];
  platforms: ComposerPlatform[];
  initialValues?: ComposerInitialValues;
  submitLabel?: string;
  postId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<ComposerIntent | null>(null);
  const [formData, setFormData] = useState({
    title: initialValues?.title || "",
    content: initialValues?.content || "",
    contentType: initialValues?.contentType || "text",
    sourceUrl: initialValues?.sourceUrl || "",
    scheduledAt: initialValues?.scheduledAt || "",
    profileId: initialValues?.profileId || "",
    platformIds: initialValues?.platformIds || [],
    mediaUrl: initialValues?.mediaUrl || "",
  });

  const selectedPlatforms = platforms.filter((platform) =>
    formData.platformIds.includes(platform.id)
  );
  const mediaKind = getMediaKind(formData.contentType);
  const needsMedia = mediaKind !== "text";
  const capabilityWarnings = selectedPlatforms
    .map((platform) => {
      if (!platform.enabled) {
        return `${platform.name} is disabled.`;
      }

      if (mediaKind === "video" && !platform.capabilities.canPublishVideo) {
        return `${platform.name} cannot publish video right now.`;
      }

      if (mediaKind === "image" && !platform.capabilities.canPublishImage) {
        return `${platform.name} cannot publish images right now.`;
      }

      if (mediaKind === "text" && !platform.capabilities.canPublishText) {
        return `${platform.name} cannot publish text right now.`;
      }

      return null;
    })
    .filter((warning): warning is string => Boolean(warning));
  const schedulingWarnings = selectedPlatforms
    .filter((platform) => !platform.capabilities.canSchedule)
    .map((platform) => `${platform.name} does not advertise scheduling support.`);
  const validationItems = [
    {
      label: "Message",
      ok: Boolean(formData.content.trim()),
      detail: formData.content.trim()
        ? `${formData.content.trim().split(/\s+/).filter(Boolean).length} words ready`
        : "Write the post body before saving.",
    },
    {
      label: "Channels",
      ok: formData.platformIds.length > 0,
      detail:
        formData.platformIds.length > 0
          ? `${formData.platformIds.length} selected`
          : "No channels selected yet.",
    },
    {
      label: "Media",
      ok: !needsMedia || Boolean(formData.mediaUrl.trim()),
      detail: needsMedia
        ? formData.mediaUrl.trim()
          ? "Media URL attached"
          : "Image and video posts need a media URL."
        : "Text mode does not require media.",
    },
    {
      label: "Capabilities",
      ok: capabilityWarnings.length === 0,
      detail:
        capabilityWarnings.length === 0
          ? "Selected channels match the current post format."
          : capabilityWarnings[0],
    },
    {
      label: "Schedule Slot",
      ok: !formData.scheduledAt || schedulingWarnings.length === 0,
      detail: formData.scheduledAt
        ? schedulingWarnings.length === 0
          ? formatScheduledPreview(formData.scheduledAt)
          : schedulingWarnings[0]
        : "No schedule slot selected.",
    },
  ];

  const handleChange = (
    event: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePlatformToggle = (platformId: string) => {
    setFormData((prev) => ({
      ...prev,
      platformIds: prev.platformIds.includes(platformId)
        ? prev.platformIds.filter((id) => id !== platformId)
        : [...prev.platformIds, platformId],
    }));
  };

  const validateIntent = (intent: ComposerIntent) => {
    if (!formData.content.trim()) {
      return "Content is required.";
    }

    if (intent !== "draft" && needsMedia && !formData.mediaUrl.trim()) {
      return `${formData.contentType} posts need a media URL.`;
    }

    if (intent === "schedule") {
      if (formData.platformIds.length === 0) {
        return "Pick at least one channel before scheduling.";
      }

      if (!formData.scheduledAt) {
        return "Choose a schedule slot first.";
      }

      if (capabilityWarnings.length > 0) {
        return capabilityWarnings[0];
      }

      if (schedulingWarnings.length > 0) {
        return schedulingWarnings[0];
      }
    }

    if (intent === "publish") {
      if (formData.platformIds.length === 0) {
        return "Pick at least one channel before publishing now.";
      }

      if (capabilityWarnings.length > 0) {
        return capabilityWarnings[0];
      }
    }

    return null;
  };

  const submitWithIntent = (intent: ComposerIntent) => {
    if (isLoading) return;
    setPendingIntent(intent);
    formRef.current?.requestSubmit();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const intent = pendingIntent || "draft";
    const validationError = validateIntent(intent);
    if (validationError) {
      alert(validationError);
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        scheduledAt: intent === "schedule" ? formData.scheduledAt : "",
        intent,
      };

      const response = await fetch(postId ? `/api/posts/${postId}` : "/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        alert(result.error || "Failed to save post");
        return;
      }

      const resolvedPostId = result.id as string;

      if (intent === "publish") {
        const publishResponse = await fetch(`/api/posts/${resolvedPostId}/publish`, {
          method: "POST",
        });
        const publishResult = await publishResponse.json();

        router.push(`/dashboard/posts/${resolvedPostId}`);

        if (!publishResponse.ok) {
          alert(publishResult.error || "Post saved, but publish now failed.");
        }

        return;
      }

      router.push(`/dashboard/posts/${resolvedPostId}`);
    } catch (error) {
      console.error("Error saving post:", error);
      alert("Failed to save post");
    } finally {
      setIsLoading(false);
      setPendingIntent(null);
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-6">
          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="section-eyebrow text-[var(--accent-tech)]">
                  {postId ? "Edit Draft" : "Compose"}
                </p>
                <h3 className="mt-2 font-serif text-[1.8rem] leading-none text-[var(--ink)]">
                  One canonical draft
                </h3>
                <p className="mt-3 max-w-[560px] text-sm leading-7 text-[var(--muted)]">
                  Pick the format first. Then lock channels, media, and timing without leaving the composer.
                </p>
              </div>
              <StatusBadge tone="neutral">
                {pendingIntent === "publish"
                  ? "Publish now"
                  : pendingIntent === "schedule"
                    ? "Schedule"
                    : submitLabel}
              </StatusBadge>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {contentTypeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, contentType: option.value }))
                  }
                  className={cn(
                    "rounded-[18px] border px-4 py-4 text-left transition",
                    formData.contentType === option.value
                      ? "border-[rgba(15,126,169,0.24)] bg-[rgba(15,126,169,0.08)]"
                      : "border-[rgba(12,17,21,0.08)] bg-white hover:border-[rgba(15,126,169,0.18)]"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-[rgba(12,17,21,0.08)] p-2.5 text-[var(--ink)]">
                      <option.Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{option.label}</p>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-6 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="grid gap-5">
              <div>
                <label
                  htmlFor="title"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Title
                </label>
                <input
                  type="text"
                  id="title"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Sharp internal label for the post"
                  className="mt-2 w-full rounded-[16px] border border-[rgba(12,17,21,0.1)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                />
              </div>

              <div>
                <label
                  htmlFor="content"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Content
                </label>
                <textarea
                  id="content"
                  name="content"
                  value={formData.content}
                  onChange={handleChange}
                  placeholder="Lead with the sharpest sentence."
                  rows={10}
                  required
                  className="mt-2 w-full resize-none rounded-[20px] border border-[rgba(12,17,21,0.1)] px-4 py-4 text-sm leading-7 text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-6 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <label
                  htmlFor="sourceUrl"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Source URL
                </label>
                <input
                  type="url"
                  id="sourceUrl"
                  name="sourceUrl"
                  value={formData.sourceUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/story"
                  className="mt-2 w-full rounded-[16px] border border-[rgba(12,17,21,0.1)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                />
              </div>

              <div>
                <label
                  htmlFor="mediaUrl"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Media URL
                </label>
                <input
                  type="url"
                  id="mediaUrl"
                  name="mediaUrl"
                  value={formData.mediaUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/asset.jpg"
                  className="mt-2 w-full rounded-[16px] border border-[rgba(12,17,21,0.1)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                />
              </div>
            </div>

            {formData.mediaUrl ? (
              <div className="mt-5 overflow-hidden rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[rgba(12,17,21,0.04)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={formData.mediaUrl}
                  alt="Composer media preview"
                  className="h-64 w-full object-cover"
                />
              </div>
            ) : null}
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-6 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="grid gap-5 md:grid-cols-[0.95fr_1.05fr]">
              <div>
                <label
                  htmlFor="profileId"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Profile
                </label>
                <select
                  id="profileId"
                  name="profileId"
                  value={formData.profileId}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-[16px] border border-[rgba(12,17,21,0.1)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                >
                  <option value="">No profile</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="scheduledAt"
                  className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]"
                >
                  Schedule Slot
                </label>
                <input
                  type="datetime-local"
                  id="scheduledAt"
                  name="scheduledAt"
                  value={formData.scheduledAt}
                  onChange={handleChange}
                  className="mt-2 w-full rounded-[16px] border border-[rgba(12,17,21,0.1)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition focus:border-[rgba(15,126,169,0.24)]"
                />
                <p className="mt-2 text-xs text-[var(--muted)]">
                  {formData.scheduledAt
                    ? `Slot locked for ${formatScheduledPreview(formData.scheduledAt)}`
                    : "Optional. Needed for the Schedule action."}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-6 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="section-eyebrow text-[var(--muted)]">Channels</p>
                <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
                  Target accounts
                </h3>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  Select the accounts that should receive this draft.
                </p>
              </div>
              <StatusBadge tone={selectedPlatforms.length > 0 ? "good" : "neutral"}>
                {selectedPlatforms.length} selected
              </StatusBadge>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {platforms.map((platform) => {
                const active = formData.platformIds.includes(platform.id);

                return (
                  <button
                    key={platform.id}
                    type="button"
                    onClick={() => handlePlatformToggle(platform.id)}
                    className={cn(
                      "rounded-[18px] border px-4 py-4 text-left transition",
                      active
                        ? "border-[rgba(15,126,169,0.24)] bg-[rgba(15,126,169,0.08)]"
                        : "border-[rgba(12,17,21,0.08)] bg-[var(--paper)] hover:border-[rgba(15,126,169,0.18)]",
                      !platform.enabled && "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--ink)]">
                          {platform.name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
                          {platform.type} · {platform.provider}
                        </p>
                        {platform.handle ? (
                          <p className="mt-2 text-sm text-[var(--muted)]">{platform.handle}</p>
                        ) : null}
                      </div>
                      <StatusBadge tone={platform.enabled ? "good" : "warn"}>
                        {platform.enabled ? "active" : "disabled"}
                      </StatusBadge>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-[#0f1722] p-5 text-white shadow-[0_18px_45px_rgba(12,17,21,0.18)]">
            <div className="flex items-center justify-between gap-3">
              <p className="section-eyebrow text-[var(--accent-gold)]">Live Preview</p>
              <StatusBadge tone="neutral">{contentTypeOptions.find((option) => option.value === formData.contentType)?.label || "Text"}</StatusBadge>
            </div>
            <div className="mt-4 text-gray-900">
              <PlatformPostPreview
                content={formData.content}
                mediaUrls={formData.mediaUrl ? [formData.mediaUrl] : []}
                platforms={selectedPlatforms.map((platform) => ({
                  id: platform.id,
                  type: platform.type,
                  handle: platform.handle,
                  name: platform.name,
                }))}
                overrides={{}}
              />
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="flex items-center gap-2">
              <Layers3 className="h-4 w-4 text-[var(--accent-tech)]" />
              <p className="text-sm font-semibold text-[var(--ink)]">Validation</p>
            </div>
            <div className="mt-4 space-y-3">
              {validationItems.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    {item.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    )}
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.label}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-[rgba(12,17,21,0.08)] bg-white p-5 shadow-[0_18px_45px_rgba(12,17,21,0.08)]">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-[var(--accent-tech)]" />
              <p className="text-sm font-semibold text-[var(--ink)]">Action Rail</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Draft and schedule are fully wired. Approval stays placeholder until the approval model lands.
            </p>

            <div className="mt-4 grid gap-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => submitWithIntent("draft")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] bg-[var(--ink)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {isLoading && pendingIntent === "draft" ? "Saving..." : submitLabel}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => submitWithIntent("schedule")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[rgba(15,126,169,0.18)] bg-[rgba(15,126,169,0.10)] px-4 py-3 text-sm font-semibold text-[var(--accent-tech)] transition hover:bg-[rgba(15,126,169,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CalendarClock className="h-4 w-4" />
                {isLoading && pendingIntent === "schedule" ? "Scheduling..." : "Schedule"}
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => submitWithIntent("publish")}
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-[rgba(210,163,93,0.30)] bg-[rgba(210,163,93,0.12)] px-4 py-3 text-sm font-semibold text-[#8c5d14] transition hover:bg-[rgba(210,163,93,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {isLoading && pendingIntent === "publish" ? "Publishing..." : "Publish Now"}
              </button>

              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-[16px] border border-dashed border-[rgba(12,17,21,0.16)] px-4 py-3 text-sm font-semibold text-[var(--muted)]"
              >
                Submit for Approval
              </button>
            </div>

            <div className="mt-4 rounded-[16px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                Outcome
              </p>
              <p className="mt-2 text-sm text-[var(--ink)]">
                {pendingIntent === "schedule"
                  ? `Will save as scheduled for ${formatScheduledPreview(formData.scheduledAt)}`
                  : pendingIntent === "publish"
                    ? "Will save, then call publish immediately."
                    : "Will save as draft."}
              </p>
            </div>
          </section>
        </aside>
      </div>
    </form>
  );
}
