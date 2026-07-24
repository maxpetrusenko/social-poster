import type { DashboardCandidate } from "./candidates";
import {
  writePostCaption,
  type PostTemplateOptions,
} from "@/lib/pipeline/script-writer";

type ScheduleLike = {
  jobType: string;
};

export type DynamicSchedulePreview = {
  label: string;
  preview: string | null;
  content: string | null;
  contentByPlatform: Record<string, string>;
  firstCommentByPlatform: Record<string, string | null>;
  mediaUrl: string | null;
  contentType: "text" | "image";
  sourceUrl: string;
  sourceHost: string;
  forecast: true;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function shorten(value: string | null | undefined, max = 140) {
  const text = normalizeText(value);
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function positiveModulo(value: number, size: number) {
  return ((value % size) + size) % size;
}

function platformKey(type: string) {
  const normalized = type.toLowerCase();
  return normalized === "x" ? "twitter" : normalized;
}

function appendSourceLinkToPreview(
  content: string,
  _sourceUrl: string,
  _platformType: string
) {
  void _sourceUrl;
  void _platformType;
  return content;
}

export function resolveDynamicSchedulePreview(
  schedule: ScheduleLike,
  candidatePool: DashboardCandidate[],
  runIndex: number,
  platformTypes: string[] = ["x"],
  postOptions?: PostTemplateOptions
): DynamicSchedulePreview | null {
  const needsImage = schedule.jobType === "image_post";
  const eligibleCandidates = candidatePool.filter((candidate) =>
    needsImage ? Boolean(candidate.previewImageUrl || candidate.ogImageUrl || candidate.imageUrl) : true
  );

  if (!eligibleCandidates.length) return null;

  const candidate =
    eligibleCandidates[positiveModulo(runIndex, eligibleCandidates.length)];
  if (!candidate) return null;

  const mediaUrl =
    candidate.previewImageUrl ??
    candidate.ogImageUrl ??
    candidate.imageUrl ??
    null;
  const summary = normalizeText(candidate.summary) || null;
  const targetPlatformTypes = platformTypes.length > 0 ? platformTypes : ["x"];
  const contentByPlatform: Record<string, string> = {};
  const firstCommentByPlatform: Record<string, string | null> = {};

  for (const platformType of targetPlatformTypes) {
    const key = platformKey(platformType);
    const rawContent =
      writePostCaption(candidate, platformType, postOptions) || candidate.title;
    contentByPlatform[key] = appendSourceLinkToPreview(
      rawContent,
      candidate.link,
      platformType
    );
    firstCommentByPlatform[key] = null;
  }

  const firstContent =
    contentByPlatform[platformKey(targetPlatformTypes[0] ?? "x")] ??
    Object.values(contentByPlatform)[0] ??
    summary;

  return {
    label: candidate.title,
    preview: shorten(firstContent ?? summary, 140),
    content: firstContent ?? summary,
    contentByPlatform,
    firstCommentByPlatform,
    mediaUrl,
    contentType: needsImage ? "image" : "text",
    sourceUrl: candidate.link,
    sourceHost: candidate.sourceHost,
    forecast: true,
  };
}
