"use client";

import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
} from "lucide-react";

export type FeedRow = {
  id: string;
  name: string;
  url: string;
  weight: number;
  enabled: boolean;
};

export type SettingsState = {
  candidateWindowHours: number;
  candidatePoolSize: number;
  minimumScore: number;
  tractionWeight: number;
  keywordBoostTerms: string[];
  transformationPrompt: string;
  xTemplate: string;
  linkedinTemplate: string;
  imageSelectionMode: "prefer_feed" | "prefer_open_graph" | "feed_only";
  imageSelectionNotes: string;
};

export type SettingsFormState = SettingsState & {
  keywordBoostTermsText: string;
};

export type CandidateRow = {
  title: string;
  link: string;
  summary: string;
  score: number;
  tractionScore: number;
  sourceLabel: string;
};

export type FeedScheduleRow = {
  id: string;
  name: string;
  jobType: string;
  cronLabel: string;
  nextRuns: string[];
};

export type FeedStoryState =
  | "selected"
  | "eligible"
  | "pool_full"
  | "too_old"
  | "low_score"
  | "already_posted"
  | "missing_fields";

export type FeedDiagnosticRow = {
  sourceName: string;
  sourceUrl: string;
  weight: number;
  enabled: boolean;
  fetchedCount: number;
  selectedCount: number;
  stories: Array<{
    title: string;
    link: string;
    summary: string;
    score: number;
    tractionScore: number;
    scoreBreakdown: string;
    imageUrl?: string;
    publishedAt?: string;
    sourceName: string;
    state: FeedStoryState;
  }>;
};

export type TabId = "sources" | "selection" | "output";

export const inputClass =
  "w-full rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-tech)] focus:ring-2 focus:ring-[rgba(15,126,169,0.14)]";

export const compactInputClass =
  "w-full rounded-[10px] border border-[rgba(12,17,21,0.1)] bg-white px-3 py-2 text-sm outline-none transition focus:border-[var(--accent-tech)] focus:ring-2 focus:ring-[rgba(15,126,169,0.14)]";

export const tabs: Array<{ id: TabId; label: string; blurb: string }> = [
  { id: "sources", label: "Sources", blurb: "Table, fetched posts, selection markers" },
  { id: "selection", label: "Selection Logic", blurb: "Scoring, traction, schedules" },
  { id: "output", label: "Writing Skill", blurb: "Selected post, prompt, final copy" },
];

export function toneForState(state: FeedStoryState) {
  switch (state) {
    case "selected":
      return "good" as const;
    case "pool_full":
      return "warn" as const;
    case "eligible":
      return "neutral" as const;
    case "too_old":
    case "already_posted":
      return "blocked" as const;
    case "low_score":
    case "missing_fields":
      return "bad" as const;
  }
}

export function labelForState(state: FeedStoryState) {
  switch (state) {
    case "selected":
      return "selected";
    case "eligible":
      return "eligible";
    case "pool_full":
      return "held";
    case "too_old":
      return "too old";
    case "low_score":
      return "low score";
    case "already_posted":
      return "already used";
    case "missing_fields":
      return "incomplete";
  }
}

export function iconForState(state: FeedStoryState) {
  switch (state) {
    case "selected":
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
    case "pool_full":
      return <CircleDashed className="h-4 w-4 text-amber-600" />;
    case "eligible":
      return <CircleDashed className="h-4 w-4 text-slate-500" />;
    default:
      return <CircleSlash className="h-4 w-4 text-stone-400" />;
  }
}

export function firstSentence(value: string) {
  const clean = value.trim();
  if (!clean) return "No summary.";
  const match = clean.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : clean;
}

export function publishedLabel(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
