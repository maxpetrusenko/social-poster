"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link as LinkIcon, Loader2, Rss, SlidersHorizontal, Upload, X } from "lucide-react";
import { PlatformBrandBadge } from "@/components/dashboard/platform-brand-icon";
import { MediaAdjustmentDialog } from "@/components/media-adjustment-dialog";
import { PlatformPostPreview } from "@/components/platform-post-preview";
import { getPlatformMeta } from "@/lib/dashboard/platforms";
import { computeCanvasPlacement } from "@/lib/media-adjustment";
import { mediaTypeFromUrl } from "@/lib/media-url";
import type { SourceEvidenceSnapshot } from "@/lib/sources";
import { getImageDimensions, getSpecForPlatform, type ImageSpec } from "@/lib/platform-specs";

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

const FORMAT_OPTIONS: Record<string, string[]> = {
  instagram: ["Feed", "Story", "Reel", "Carousel"],
  instagram_personal: ["Feed", "Story", "Reel", "Carousel"],
  facebook: ["Feed", "Story", "Reel"],
};

const PUBLISH_MODES = ["schedule", "now", "queue", "draft"] as const;
type PublishMode = (typeof PUBLISH_MODES)[number];
const PUBLISH_LABELS: Record<PublishMode, string> = {
  schedule: "schedule post", now: "publish now", queue: "add to queue", draft: "save draft",
};
const DEFAULT_MAX_MEDIA_ATTACHMENTS = 20;
const DRAFT_STORAGE_KEY = "social-poster:create-post-composer:v1";

type PlatformOverride = { caption?: string; firstComment?: string; format?: string; collaborators?: string[] };
type GenerationSource = "rss" | "x" | "url";
type DraftCandidate = {
  title?: string;
  link?: string;
  url?: string;
  content: string;
  imageUrl?: string | null;
  score?: number;
  sourceName?: string;
  createdAt?: string | null;
};
type GeneratedDraft = {
  content?: string;
  sourceUrl?: string;
  title?: string;
  imageUrl?: string | null;
  sourceEvidenceId?: string;
  sourceEvidenceSnapshot?: SourceEvidenceSnapshot;
  candidates?: DraftCandidate[];
};
type StoredComposerDraft = {
  content?: string;
  platformIds?: string[];
  profileId?: string;
  publishMode?: PublishMode;
  scheduledAt?: string;
  timezone?: string;
  mediaUrls?: string[];
  mediaDimensions?: Record<string, ImageSpec>;
  newMediaUrl?: string;
  draftUrl?: string;
  sourceUrl?: string;
  sourceEvidenceId?: string;
  sourceEvidenceSnapshot?: SourceEvidenceSnapshot | null;
  generationCandidates?: DraftCandidate[];
  platformOverrides?: Record<string, PlatformOverride>;
  previewSpecs?: Record<string, ImageSpec>;
  threadEnabled?: boolean;
};

export function CreatePostComposer({ profiles, platforms }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const draftRestoredRef = useRef(false);
  const [content, setContent] = useState("");
  const [platformIds, setPlatformIds] = useState<string[]>([]);
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [publishMode, setPublishMode] = useState<PublishMode>("now");
  const [scheduledAt, setScheduledAt] = useState("");
  const [timezone, setTimezone] = useState("America/New_York");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [mediaDimensions, setMediaDimensions] = useState<Record<string, ImageSpec>>({});
  const [newMediaUrl, setNewMediaUrl] = useState("");
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [showDraftUrlInput, setShowDraftUrlInput] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceEvidenceId, setSourceEvidenceId] = useState("");
  const [sourceEvidenceSnapshot, setSourceEvidenceSnapshot] = useState<SourceEvidenceSnapshot | null>(null);
  const [generating, setGenerating] = useState<GenerationSource | null>(null);
  const [generationError, setGenerationError] = useState("");
  const [generationCandidates, setGenerationCandidates] = useState<DraftCandidate[]>([]);
  const [isDraggingMedia, setIsDraggingMedia] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(0);
  const [resolvingMediaUrl, setResolvingMediaUrl] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const [adjustingMediaIndex, setAdjustingMediaIndex] = useState<number | null>(null);
  const [platformOverrides, setPlatformOverrides] = useState<Record<string, PlatformOverride>>({});
  const [previewSpecs, setPreviewSpecs] = useState<Record<string, ImageSpec>>({});
  const [submitting, setSubmitting] = useState(false);
  const [threadEnabled, setThreadEnabled] = useState(false);

  const selectedPlatforms = platforms.filter((p) => platformIds.includes(p.id));
  const mediaLimit = useMemo(() => maxMediaAttachmentsForPlatforms(selectedPlatforms), [selectedPlatforms]);
  const activeMediaUrl = mediaUrls[0] ?? "";
  const activeMediaIsImage = Boolean(activeMediaUrl) && !isVideoMediaUrl(activeMediaUrl);
  const hasVideoMedia = mediaUrls.some((url) => isVideoMediaUrl(url));
  const effectivePreviewSpecs = useMemo(() => {
    const specs = { ...previewSpecs };
    if (!activeMediaIsImage) return specs;

    for (const platform of selectedPlatforms) {
      if (specs[platform.id]) continue;
      const format = platformOverrides[platform.id]?.format ?? defaultFormatForPlatform(platform.type);
      const [dimension] = getImageDimensions(platform.type, format);
      if (dimension) specs[platform.id] = dimension;
    }

    return specs;
  }, [activeMediaIsImage, platformOverrides, previewSpecs, selectedPlatforms]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        draftRestoredRef.current = true;
        return;
      }

      const draft = JSON.parse(raw) as StoredComposerDraft;
      const validPlatformIds = new Set(platforms.map((platform) => platform.id));
      const validProfileIds = new Set(profiles.map((profile) => profile.id));

      if (typeof draft.content === "string") setContent(draft.content);
      if (Array.isArray(draft.platformIds)) {
        setPlatformIds(draft.platformIds.filter((id) => validPlatformIds.has(id)));
      }
      if (typeof draft.profileId === "string" && validProfileIds.has(draft.profileId)) {
        setProfileId(draft.profileId);
      }
      if (draft.publishMode && PUBLISH_MODES.includes(draft.publishMode)) {
        setPublishMode(draft.publishMode);
      }
      if (typeof draft.scheduledAt === "string") setScheduledAt(draft.scheduledAt);
      if (typeof draft.timezone === "string") setTimezone(draft.timezone);
      if (Array.isArray(draft.mediaUrls)) {
        setMediaUrls(draft.mediaUrls.filter((url): url is string => typeof url === "string"));
      }
      if (draft.mediaDimensions && typeof draft.mediaDimensions === "object") {
        setMediaDimensions(draft.mediaDimensions);
      }
      if (typeof draft.newMediaUrl === "string") setNewMediaUrl(draft.newMediaUrl);
      if (typeof draft.draftUrl === "string") setDraftUrl(draft.draftUrl);
      if (typeof draft.sourceUrl === "string") setSourceUrl(draft.sourceUrl);
      if (typeof draft.sourceEvidenceId === "string") setSourceEvidenceId(draft.sourceEvidenceId);
      if (draft.sourceEvidenceSnapshot && typeof draft.sourceEvidenceSnapshot === "object") {
        setSourceEvidenceSnapshot(draft.sourceEvidenceSnapshot as SourceEvidenceSnapshot);
      }
      if (Array.isArray(draft.generationCandidates)) setGenerationCandidates(draft.generationCandidates);
      if (draft.platformOverrides && typeof draft.platformOverrides === "object") {
        setPlatformOverrides(draft.platformOverrides);
      }
      if (draft.previewSpecs && typeof draft.previewSpecs === "object") {
        setPreviewSpecs(draft.previewSpecs);
      }
      if (typeof draft.threadEnabled === "boolean") setThreadEnabled(draft.threadEnabled);
    } catch {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } finally {
      draftRestoredRef.current = true;
    }
  }, [platforms, profiles]);

  useEffect(() => {
    if (!draftRestoredRef.current) return;

    const draft: StoredComposerDraft = {
      content,
      platformIds,
      profileId,
      publishMode,
      scheduledAt,
      timezone,
      mediaUrls,
      mediaDimensions,
      newMediaUrl,
      draftUrl,
      sourceUrl,
      sourceEvidenceId,
      sourceEvidenceSnapshot,
      generationCandidates,
      platformOverrides,
      previewSpecs,
      threadEnabled,
    };

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    content,
    draftUrl,
    generationCandidates,
    mediaUrls,
    mediaDimensions,
    newMediaUrl,
    platformIds,
    sourceEvidenceId,
    sourceEvidenceSnapshot,
    platformOverrides,
    previewSpecs,
    profileId,
    publishMode,
    scheduledAt,
    sourceUrl,
    threadEnabled,
    timezone,
  ]);

  function togglePlatform(id: string) {
    setPlatformIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function updateOverride(platformId: string, key: keyof PlatformOverride, value: string | string[]) {
    setPlatformOverrides((prev) => ({
      ...prev, [platformId]: { ...prev[platformId], [key]: value },
    }));
  }

  function updatePlatformFormat(platformId: string, format: string) {
    updateOverride(platformId, "format", format);
    setPreviewSpecs((prev) => {
      const next = { ...prev };
      delete next[platformId];
      return next;
    });
  }

  function originalImageSpec(url: string): ImageSpec | null {
    return mediaDimensions[url] ?? null;
  }

  function loadMediaDimensions(url: string) {
    if (!url || isVideoMediaUrl(url) || mediaDimensions[url]) return;

    const image = new Image();
    image.onload = () => {
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) return;

      setMediaDimensions((prev) => ({
        ...prev,
        [url]: {
          label: "Original",
          width,
          height,
          aspect: ratioLabel(width, height),
        },
      }));
    };
    image.src = proxiedImageUrl(url);
  }

  useEffect(() => {
    for (const url of mediaUrls) {
      loadMediaDimensions(url);
    }
  });

  async function resolveRemoteMediaUrl(url: string) {
    if (!url) return;

    const response = await fetch("/api/media/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const result = await response.json().catch(() => ({}));

    if (!response.ok || typeof result.url !== "string") {
      throw new Error(
        typeof result.error === "string" ? result.error : "Could not resolve media URL."
      );
    }

    return result.url as string;
  }

  async function addMediaUrl() {
    const url = newMediaUrl.trim();
    if (!url) return;

    setResolvingMediaUrl(true);
    setMediaError("");

    try {
      if (mediaUrls.length >= mediaLimit) {
        setMediaError(`Remove media before adding another. Selected platforms allow ${mediaLimit}.`);
        return;
      }

      const resolvedUrl = await resolveRemoteMediaUrl(url);
      if (!resolvedUrl) return;
      if (isVideoMediaUrl(resolvedUrl) && mediaUrls.length > 0) {
        setMediaError("Use one video by itself, or remove it and add images.");
        return;
      }
      if (!isVideoMediaUrl(resolvedUrl) && hasVideoMedia) {
        setMediaError("Remove the video before adding images.");
        return;
      }
      setMediaUrls((prev) => [...prev, resolvedUrl].slice(0, mediaLimit));
      loadMediaDimensions(resolvedUrl);
      setNewMediaUrl("");
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Could not resolve media URL.");
    } finally {
      setResolvingMediaUrl(false);
    }
  }

  function removeMediaUrl(idx: number) {
    setMediaUrls((prev) => {
      const removedUrl = prev[idx];
      if (removedUrl) {
        setMediaDimensions((current) => {
          const next = { ...current };
          delete next[removedUrl];
          return next;
        });
      }
      return prev.filter((_, i) => i !== idx);
    });
  }

  function isVideoMediaUrl(url: string) {
    return mediaTypeFromUrl(url) === "video";
  }

  async function applyGeneratedDraft(draft: GeneratedDraft) {
    if (draft.content) setContent(draft.content);
    if (draft.sourceUrl) setSourceUrl(draft.sourceUrl);
    setSourceEvidenceId(draft.sourceEvidenceId || "");
    setSourceEvidenceSnapshot(draft.sourceEvidenceSnapshot || null);
    if (draft.imageUrl) {
      try {
        const resolvedUrl = await resolveRemoteMediaUrl(draft.imageUrl);
        if (resolvedUrl) {
          setMediaUrls([resolvedUrl]);
          loadMediaDimensions(resolvedUrl);
        }
      } catch (error) {
        setMediaError(error instanceof Error ? error.message : "Could not resolve draft image.");
      }
    }
  }

  async function loadGeneratedDraft(source: GenerationSource, url?: string) {
    setGenerating(source);
    setGenerationError("");
    setMediaError("");

    try {
      const endpoint =
        source === "rss"
          ? "/api/post-generation/rss"
          : source === "x"
            ? "/api/post-generation/x"
            : "/api/post-generation/url";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          platformTypes: selectedPlatforms.map((platform) => platform.type),
        }),
      });
      const result = (await response.json().catch(() => ({}))) as GeneratedDraft & { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not generate post.");

      if (source === "url" && url) setDraftUrl(url);
      setGenerationCandidates(result.candidates || []);
      await applyGeneratedDraft(result);
      if (source === "url") setShowDraftUrlInput(false);
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : "Could not generate post.");
    } finally {
      setGenerating(null);
    }
  }

  function handleUrlGeneratorClick() {
    const url = draftUrl.trim();
    if (url) {
      void loadGeneratedDraft("url", url);
      return;
    }
    setShowDraftUrlInput(true);
  }

  async function uploadMediaFiles(inputFiles: FileList | File[]) {
    const acceptedFiles = Array.from(inputFiles).filter((file) =>
      file.type.startsWith("image/") || file.type.startsWith("video/")
    );

    if (acceptedFiles.length === 0) {
      setMediaError("Use an image or video file.");
      return;
    }

    const hasVideoFile = acceptedFiles.some((file) => file.type.startsWith("video/"));
    const hasImageFile = acceptedFiles.some((file) => file.type.startsWith("image/"));
    if (hasVideoFile && (hasImageFile || acceptedFiles.length > 1 || mediaUrls.length > 0)) {
      setMediaError("Use one video by itself, or remove it and add images.");
      return;
    }
    if (hasImageFile && hasVideoMedia) {
      setMediaError("Remove the video before adding images.");
      return;
    }

    if (acceptedFiles.length > mediaLimit) {
      setMediaError(`Selected platforms allow ${mediaLimit} media item${mediaLimit === 1 ? "" : "s"}.`);
      return;
    }

    const remainingSlots = Math.max(mediaLimit - mediaUrls.length, 0);
    if (remainingSlots === 0) {
      setMediaError(`Remove media before adding another. Selected platforms allow ${mediaLimit}.`);
      return;
    }

    const files = acceptedFiles.slice(0, remainingSlots);
    setMediaError("");
    setUploadingMedia(files.length);

    try {
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || typeof result.url !== "string") {
          throw new Error(
            typeof result.error === "string" ? result.error : "Media upload failed."
          );
        }

        uploadedUrls.push(result.url);
      }

      const nextUrls = uploadedUrls.slice(0, remainingSlots);
      setMediaUrls((prev) => [...prev, ...nextUrls].slice(0, mediaLimit));
      for (const uploadedUrl of nextUrls) {
        loadMediaDimensions(uploadedUrl);
      }
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Media upload failed.");
    } finally {
      setUploadingMedia(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setMediaError("");
    try {
      if (mediaUrls.length > mediaLimit) {
        setMediaError(`Selected platforms allow ${mediaLimit} media item${mediaLimit === 1 ? "" : "s"}.`);
        return;
      }
      if (hasVideoMedia && mediaUrls.length > 1) {
        setMediaError("Use one video by itself, or remove it and add images.");
        return;
      }

      const intent = publishMode === "now" ? "publish" : publishMode === "schedule" ? "schedule" : "draft";
      const mediaVariants = await buildPlatformMediaVariants();
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content, platformIds, profileId, intent,
          scheduledAt: publishMode === "schedule" ? scheduledAt : undefined,
          contentType: mediaUrls.length > 0 ? (isVideoMediaUrl(mediaUrls[0]) ? "video" : "image") : "text",
          mediaUrl: mediaUrls[0] || undefined,
          mediaUrls,
          sourceUrl: sourceUrl || undefined,
          sourceEvidenceId: sourceEvidenceId || undefined,
          sourceEvidenceSnapshot: sourceEvidenceSnapshot || undefined,
          platformOverrides,
          previewSpecs: effectivePreviewSpecs,
          mediaUrlByPlatformId: mediaVariants.byPlatformId,
          mediaUrlByPlatformType: mediaVariants.byPlatformType,
          mediaUrlsByPlatformId: mediaVariants.urlsByPlatformId,
          mediaUrlsByPlatformType: mediaVariants.urlsByPlatformType,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (intent === "publish") {
          await fetch(`/api/posts/${data.id}/publish`, { method: "POST" });
        }
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        router.push(`/dashboard/posts/${data.id}`);
      }
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : "Could not prepare media.");
    } finally {
      setSubmitting(false);
    }
  }

  async function buildPlatformMediaVariants(): Promise<{
    byPlatformId: Record<string, string>;
    byPlatformType: Record<string, string>;
    urlsByPlatformId: Record<string, string[]>;
    urlsByPlatformType: Record<string, string[]>;
  }> {
    const imageUrls = mediaUrls.filter((url) => !isVideoMediaUrl(url));
    if (imageUrls.length === 0 || imageUrls.length !== mediaUrls.length) {
      return { byPlatformId: {}, byPlatformType: {}, urlsByPlatformId: {}, urlsByPlatformType: {} };
    }

    const images = await Promise.all(imageUrls.map((url) => loadImage(proxiedImageUrl(url))));
    const uploadedByUrlAndSize = new Map<string, string>();
    const byPlatformId: Record<string, string> = {};
    const byPlatformType: Record<string, string> = {};
    const urlsByPlatformId: Record<string, string[]> = {};
    const urlsByPlatformType: Record<string, string[]> = {};

    for (const platform of selectedPlatforms) {
      const preset = effectivePreviewSpecs[platform.id];
      if (!preset) continue;
      const variants: string[] = [];

      for (const [index, image] of images.entries()) {
        const sizeKey = `${imageUrls[index]}:${preset.width}x${preset.height}`;
        let variantUrl = uploadedByUrlAndSize.get(sizeKey);

        if (!variantUrl) {
          variantUrl = await uploadFitPaddedImageVariant({
            image,
            preset,
            label: `${platform.type}-${index + 1}`,
          });
          uploadedByUrlAndSize.set(sizeKey, variantUrl);
        }
        variants.push(variantUrl);
      }

      if (variants[0]) {
        byPlatformId[platform.id] = variants[0];
        byPlatformType[platform.type] = variants[0];
      }
      urlsByPlatformId[platform.id] = variants;
      urlsByPlatformType[platform.type] = variants;
    }

    return { byPlatformId, byPlatformType, urlsByPlatformId, urlsByPlatformType };
  }

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
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-gray-700">content</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void loadGeneratedDraft("rss")}
                    disabled={generating !== null}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                    title="Generate from RSS"
                    aria-label="Generate from RSS"
                  >
                    {generating === "rss" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rss className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadGeneratedDraft("x")}
                    disabled={generating !== null}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-50"
                    title="Use latest X posts"
                    aria-label="Use latest X posts"
                  >
                    {generating === "x" ? <Loader2 className="h-4 w-4 animate-spin" /> : "X"}
                  </button>
                  <button
                    type="button"
                    onClick={handleUrlGeneratorClick}
                    disabled={generating !== null}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
                    title="Load from URL"
                    aria-label="Load from URL"
                  >
                    {generating === "url" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LinkIcon className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="relative">
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="what's on your mind..." rows={6}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                <span className="absolute right-3 bottom-3 text-xs text-gray-400">{content.length} chars</span>
              </div>
              {showDraftUrlInput ? (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="url"
                    value={draftUrl}
                    onChange={(event) => setDraftUrl(event.target.value)}
                    placeholder="paste article or post URL..."
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void loadGeneratedDraft("url", draftUrl.trim());
                      }
                    }}
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void loadGeneratedDraft("url", draftUrl.trim())}
                    disabled={generating !== null || !draftUrl.trim()}
                    className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    Load
                  </button>
                </div>
              ) : null}
              {generationError ? <p className="mt-2 text-xs text-red-600">{generationError}</p> : null}
              {sourceUrl ? (
                <p className="mt-2 truncate text-xs text-gray-400">source: {sourceUrl}</p>
              ) : null}
              {generationCandidates.length > 1 ? (
                <div className="mt-3 space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
                  {generationCandidates.slice(0, 4).map((candidate, index) => (
                    <button
                      key={`${candidate.link || candidate.url || candidate.title || "candidate"}-${index}`}
                      type="button"
                      onClick={() => void applyGeneratedDraft({
                        content: candidate.content,
                        sourceUrl: candidate.link || candidate.url,
                        title: candidate.title,
                        imageUrl: candidate.imageUrl,
                      })}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-600 hover:bg-white"
                    >
                      <span className="line-clamp-1 font-medium text-gray-800">
                        {candidate.title || candidate.content}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {candidate.sourceName || candidate.createdAt || candidate.link || candidate.url}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {/* Media URLs */}
              <div className="mt-3">
                {mediaUrls.length > 0 && (
                  <div className="mb-3 grid grid-cols-4 gap-2">
                    {mediaUrls.map((url, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                        {isVideoMediaUrl(url) ? (
                          <video src={url} className="h-full w-full object-cover" muted playsInline />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        )}
                        <button type="button" onClick={() => removeMediaUrl(i)}
                          className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label="Remove media">
                          <X className="h-3.5 w-3.5" />
                        </button>
                        {!isVideoMediaUrl(url) ? (
                          <button
                            type="button"
                            onClick={() => setAdjustingMediaIndex(i)}
                            className="absolute bottom-1 left-1 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium text-white opacity-0 transition group-hover:opacity-100"
                          >
                            <SlidersHorizontal className="h-3 w-3" />
                            Adjust
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    if (event.currentTarget.files) void uploadMediaFiles(event.currentTarget.files);
                  }}
                />

                <div
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingMedia(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingMedia(true);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget === event.target) setIsDraggingMedia(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingMedia(false);
                    void uploadMediaFiles(event.dataTransfer.files);
                  }}
                  className={`rounded-lg border border-dashed p-3 transition ${
                    isDraggingMedia ? "border-[#7a3030] bg-[#7a3030]/5" : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#7a3030]">
                      {uploadingMedia > 0 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-700">
                        {uploadingMedia > 0 ? `Uploading ${uploadingMedia}...` : "Drop media here"}
                      </p>
                      <p className="text-xs text-gray-400">
                        JPG, PNG, WEBP, GIF, MP4, MOV, WEBM up to 25 MB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#7a3030] px-3 py-2 text-xs font-medium text-white hover:bg-[#6a2828]"
                    >
                      <ImagePlus className="h-3.5 w-3.5" />
                      Select
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMediaInput((value) => !value)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      <LinkIcon className="h-3.5 w-3.5" />
                      URL
                    </button>
                  </div>
                  {mediaError ? <p className="mt-2 text-xs text-red-600">{mediaError}</p> : null}
                </div>

                {showMediaInput ? (
                  <div className="mt-2 flex items-center gap-2">
                    <input type="url" value={newMediaUrl} onChange={(e) => setNewMediaUrl(e.target.value)}
                      placeholder="paste image, video, or social post URL..." onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addMediaUrl();
                        }
                      }}
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-gray-300 focus:ring-0 focus:outline-none" />
                    <button type="button" onClick={() => void addMediaUrl()} disabled={resolvingMediaUrl} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50">
                      {resolvingMediaUrl ? "Resolving" : "Add"}
                    </button>
                    <button type="button" onClick={() => { setShowMediaInput(false); setNewMediaUrl(""); }} className="text-xs text-gray-400 hover:text-gray-600">close</button>
                  </div>
                ) : null}

                {mediaUrls.length > 0 && (
                  <p className="mt-2 text-xs text-gray-400">
                    {mediaUrls.length}/{mediaLimit} media selected
                  </p>
                )}

                {/* Image dimension hints */}
                {mediaUrls.length > 0 && selectedPlatforms.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="mb-1.5 text-xs font-medium text-amber-800">Recommended image sizes</p>
                    <div className="space-y-1">
                      {selectedPlatforms.map((p) => {
                        const override = platformOverrides[p.id];
                        const dims = getImageDimensions(p.type, override?.format ?? defaultFormatForPlatform(p.type));
                        const original = mediaUrls[0] ? originalImageSpec(mediaUrls[0]) : null;
                        if (dims.length === 0 && !original) return null;
                        return (
                          <div key={p.id} className="flex items-center gap-2 text-[11px] text-amber-700">
                            <span className="font-medium">{p.type}:</span>
                            {original ? (
                              <button
                                type="button"
                                onClick={() => setPreviewSpecs((prev) => ({ ...prev, [p.id]: original }))}
                                className={`rounded px-1.5 py-0.5 transition ${
                                  effectivePreviewSpecs[p.id]?.width === original.width && effectivePreviewSpecs[p.id]?.height === original.height
                                    ? "bg-[#7a3030] text-white"
                                    : "bg-amber-100 hover:bg-amber-200"
                                }`}
                              >
                                original {original.width}x{original.height} ({original.aspect})
                              </button>
                            ) : null}
                            {dims.map((d) => (
                              <button
                                key={`${d.label}-${d.width}-${d.height}`}
                                type="button"
                                onClick={() => setPreviewSpecs((prev) => ({ ...prev, [p.id]: d }))}
                                className={`rounded px-1.5 py-0.5 transition ${
                                  effectivePreviewSpecs[p.id]?.width === d.width && effectivePreviewSpecs[p.id]?.height === d.height
                                    ? "bg-[#7a3030] text-white"
                                    : "bg-amber-100 hover:bg-amber-200"
                                }`}
                              >
                                {d.width}x{d.height} ({d.aspect})
                              </button>
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
              const meta = getPlatformMeta(pType);
              const charLimit = spec?.charLimit || 5000;
              const firstCommentLimit = spec?.firstCommentLimit;

              return (
                <div key={platform.id} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <PlatformBrandBadge type={pType} label={meta.label} className="h-6 w-6" iconClassName="h-3.5 w-3.5" />
                    <span className="text-sm font-medium text-gray-700">{meta.label}</span>
                    {platform.handle && <span className="text-xs text-gray-400">@{platform.handle}</span>}
                  </div>

                  {formats && (
                    <div className="mb-3 flex gap-1 rounded-lg bg-gray-100 p-1">
                      {formats.map((f) => (
                        <button key={f} onClick={() => updatePlatformFormat(platform.id, f)}
                          className={`rounded-md px-3 py-1 text-xs font-medium transition ${(override.format || formats[0]) === f ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                          {f}
                        </button>
                      ))}
                    </div>
                  )}

                  {(pType === "instagram" || pType === "instagram_personal") && (
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
                  const meta = getPlatformMeta(pType);
                  const selected = platformIds.includes(p.id);
                  const needsMedia = selected && mediaUrls.length === 0 && (pType === "instagram" || pType === "pinterest" || pType === "tiktok");
                  return (
                    <button key={p.id} onClick={() => togglePlatform(p.id)}
                      className={`relative rounded-lg border p-3 text-left transition ${selected ? "border-green-400 bg-green-50/50" : "border-gray-200 hover:border-gray-300"}`}>
                      {selected && <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px] text-white">✓</span>}
                      {needsMedia && <span className="absolute top-1.5 left-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-orange-400" title="Missing media content" />}
                      <PlatformBrandBadge type={pType} label={meta.label} className="mb-1.5" />
                      <div className="text-xs font-medium text-gray-700">{meta.label}</div>
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
              sourceUrl={sourceUrl || null}
              platforms={selectedPlatforms.map((p) => ({ id: p.id, type: p.type, handle: p.handle, name: p.name }))}
              overrides={platformOverrides}
              previewSpecs={effectivePreviewSpecs}
              threadEnabled={threadEnabled}
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
      {adjustingMediaIndex !== null && mediaUrls[adjustingMediaIndex] ? (
        <MediaAdjustmentDialog
          sourceUrl={mediaUrls[adjustingMediaIndex]}
          platforms={selectedPlatforms.map((platform) => ({
            id: platform.id,
            type: platform.type,
            format: platformOverrides[platform.id]?.format,
          }))}
          onClose={() => setAdjustingMediaIndex(null)}
          onApply={(url) => {
            setMediaUrls((prev) => prev.map((item, index) => index === adjustingMediaIndex ? url : item));
            loadMediaDimensions(url);
          }}
        />
      ) : null}
    </div>
  );
}

function proxiedImageUrl(url: string) {
  if (url.startsWith("/")) return url;
  return `/api/og-image?${new URLSearchParams({ url }).toString()}`;
}

function ratioLabel(width: number, height: number) {
  const value = gcd(width, height);
  return `${Math.round(width / value)}:${Math.round(height / value)}`;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function defaultFormatForPlatform(type: string) {
  return FORMAT_OPTIONS[type.toLowerCase()]?.[0];
}

function maxMediaAttachmentsForPlatforms(platforms: { type: string }[]) {
  if (platforms.length === 0) return DEFAULT_MAX_MEDIA_ATTACHMENTS;

  return Math.max(
    1,
    Math.min(
      ...platforms.map((platform) => {
        const spec = getSpecForPlatform(platform.type.toLowerCase());
        if (!spec || !spec.supportsMultiImage) return 1;
        return Math.max(1, spec.maxImages);
      })
    )
  );
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image for platform sizing."));
    image.src = url;
  });
}

async function uploadFitPaddedImageVariant(input: {
  image: HTMLImageElement;
  preset: ImageSpec;
  label: string;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = input.preset.width;
  canvas.height = input.preset.height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const placement = computeCanvasPlacement({
    sourceWidth: input.image.naturalWidth,
    sourceHeight: input.image.naturalHeight,
    targetWidth: canvas.width,
    targetHeight: canvas.height,
    mode: "fit",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  });

  context.drawImage(
    input.image,
    placement.dx,
    placement.dy,
    placement.drawWidth,
    placement.drawHeight
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92)
  );
  if (!blob) throw new Error("Could not export platform-sized image.");

  const formData = new FormData();
  formData.append(
    "file",
    new File([blob], `${input.label}-${input.preset.width}x${input.preset.height}.jpg`, {
      type: "image/jpeg",
    })
  );

  const response = await fetch("/api/media/upload", {
    method: "POST",
    body: formData,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || typeof result.url !== "string") {
    throw new Error(typeof result.error === "string" ? result.error : "Variant upload failed.");
  }

  return result.url as string;
}
