import type { DashboardCandidate } from "./candidates";

type ScheduleLike = {
  jobType: string;
};

export type DynamicSchedulePreview = {
  label: string;
  preview: string | null;
  content: string | null;
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

export function resolveDynamicSchedulePreview(
  schedule: ScheduleLike,
  candidatePool: DashboardCandidate[],
  runIndex: number
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

  return {
    label: candidate.title,
    preview: shorten(summary, 140),
    content: summary,
    mediaUrl,
    contentType: needsImage ? "image" : "text",
    sourceUrl: candidate.link,
    sourceHost: candidate.sourceHost,
    forecast: true,
  };
}
