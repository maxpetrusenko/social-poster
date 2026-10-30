import "server-only";

import { callWritingModel, extractResponsesText } from "@/lib/writing-model";
import { safeFetchRemote } from "@/lib/safe-remote-fetch";
import {
  buildThesisPrompt,
  buildThesisRepairSuffix,
  parseThesisResponse,
  validateThesis,
  type ThesisResult,
} from "./thesis";

export type ThesisStory = {
  title: string;
  summary?: string | null;
  link?: string | null;
  sourceName?: string | null;
  summaryWasGarbage?: boolean;
};

export type ThesisGenerationOptions = {
  workspaceId?: string | null;
  extraSources?: { title: string; url: string; text: string }[];
  now?: Date;
  /** Test seam: replaces the network fetch. */
  fetchText?: (url: string) => Promise<string>;
};

/** Stage rollout switch. Off by default so existing lanes keep their behaviour. */
export function isThesisStageEnabled() {
  const value = (process.env.THESIS_STAGE || "").toLowerCase();
  return value === "on" || value === "1" || value === "true";
}

const MAX_SOURCE_CHARS = 6000;

export function stripHtmlToText(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchSourceText(url: string, fetchText?: (url: string) => Promise<string>) {
  if (fetchText) {
    try {
      return (await fetchText(url)).slice(0, MAX_SOURCE_CHARS);
    } catch {
      return "";
    }
  }

  try {
    const response = await safeFetchRemote(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; social-poster-thesis/1.0)" },
    });
    if (!response?.ok) return "";
    const body = await response.text();
    return stripHtmlToText(body).slice(0, MAX_SOURCE_CHARS);
  } catch {
    return "";
  }
}

/**
 * Read the story, decide whether it supports a view, and return either that view
 * with its evidence trail or an explicit skip. A skip is a routing decision, not an
 * error: it keeps a viewless summary off the account.
 */
export async function generateThesisForStory(
  story: ThesisStory,
  options: ThesisGenerationOptions = {}
): Promise<ThesisResult> {
  const title = (story.title || "").trim();
  if (!title) return { action: "skip", reason: "story has no title" };

  const sourceText = story.link ? await fetchSourceText(story.link, options.fetchText) : "";
  const summary = (story.summary || "").trim();
  if (!sourceText && summary.length < 80) {
    return { action: "skip", reason: "not enough source material to form a view" };
  }

  const prompt = buildThesisPrompt({
    now: (options.now ?? new Date()).toISOString().slice(0, 10),
    sourceUrl: story.link ?? "",
    title,
    summary: story.summaryWasGarbage ? "(rss summary was noise)" : summary,
    sourceName: story.sourceName || "unknown",
    sourceText,
    extraSources: options.extraSources,
  });

  let attemptPrompt = prompt;
  let lastReason = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await callWritingModel({
      name: "pipeline-thesis",
      prompt: attemptPrompt,
      json: true,
      fallbackModel: "deepseek-chat",
      workspaceId: options.workspaceId ?? null,
      slot: "writing",
      tags: ["pipeline", "thesis"],
      metadata: { source: "thesis", sourceUrl: story.link ?? null, title, attempt },
    });

    const text = extractResponsesText(result.data) || result.text || "";
    let payload: unknown = null;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
    if (!payload) {
      lastReason = "model did not return JSON";
      attemptPrompt = `${prompt}${buildThesisRepairSuffix([lastReason])}`;
      continue;
    }

    const parsed = parseThesisResponse(payload);
    if (parsed.action === "skip") return parsed;

    const validation = validateThesis(parsed.thesis, { title });
    if (validation.ok) return parsed;

    lastReason = validation.problems.join("; ");
    attemptPrompt = `${prompt}${buildThesisRepairSuffix(validation.problems)}`;
  }

  return { action: "skip", reason: `thesis failed validation: ${lastReason}` };
}
