/**
 * Template voice scripts + social captions.
 * Max voice: personal take first, fragments ok, no hashtags/emoji/BREAKING.
 *
 * Token resolution uses the story summary directly. When the summary is
 * empty or garbage (e.g. "Comments."), tokens that depend on it resolve
 * to empty strings so the template collapses gracefully.
 */

import { cleanRichText } from "./content-clean";

export type PostTemplateOptions = {
  xTemplate?: string;
  linkedinTemplate?: string;
  transformationPrompt?: string;
  seed?: number;
};

type PromptConfig = {
  opener: "none" | "reaction";
  titleCaseOnX: boolean;
  bannedPhrases: string[];
};

// ─── Summary quality gate ────────────────────────────────────────────────

const GARBAGE_SUMMARIES = new Set([
  "comments",
  "comments.",
  "comment",
  "points",
  "link",
]);

function isUsableSummary(summary: string): boolean {
  if (!summary) return false;
  const trimmed = summary.trim();
  if (trimmed.length < 15) return false;
  if (GARBAGE_SUMMARIES.has(trimmed.toLowerCase())) return false;
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────────

export function writeVoiceScript(story: { title: string; summary: string }): string {
  const t = cleanRichText(story.title);
  const s = cleanRichText(story.summary);

  const nums = (t + " " + s).match(/\d[\d,.]*[BMK]?/g);
  const numRef = nums?.[0] ? `${nums[0]}` : "";

  const templates = [
    `${t}. ${numRef ? `${numRef} ` : ""}${extractSubstance(t, s, 0)}.`,
    `${verbalize(t)}. ${pickDetail(s)}. ${extractSubstance(t, s, 1)}.`,
    `${pickReaction(2, parseTransformationPrompt("opener: reaction"))} ${t}. ${extractBuilderAngle(t, s, 2)}.`,
  ];

  const idx = Math.floor(Date.now() / 60000) % templates.length;
  return templates[idx];
}

export function writeVideoBullets(story: { title: string; summary: string }): string[] {
  const title = cleanRichText(story.title);
  const summary = cleanRichText(story.summary);
  const source = `${title}. ${summary}`.replace(/\s+/g, " ").trim();
  const sentences = source
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const bullets = [
    extractStatLine(source),
    shorten(sentences[0] || title, 60),
    shorten(sentences[1] || extractSubstance(title, summary, 0), 60),
    shorten(sentences[2] || extractBuilderAngle(title, summary, 0), 60),
  ]
    .filter(Boolean)
    .map((line) => line!.replace(/[.!?]+$/g, "").trim())
    .filter((line, index, arr) => arr.indexOf(line) === index)
    .slice(0, 4);

  while (bullets.length < 4) {
    bullets.push(fallbackBullet(bullets.length, title));
  }

  return bullets;
}

export function writePostCaption(
  story: { title: string; summary: string },
  platform: string,
  options?: PostTemplateOptions
): string {
  const t = cleanRichText(story.title);
  const s = cleanRichText(story.summary);
  const prompt = parseTransformationPrompt(options?.transformationPrompt);
  const seed = options?.seed ?? 0;
  const xTemplate = options?.xTemplate || "{{title}}. {{whyMatters}}";
  const linkedinTemplate =
    options?.linkedinTemplate ||
    "{{title}}\n\n{{summarySentence}}\n\n{{whyMatters}}.";

  switch (platform.toLowerCase()) {
    case "twitter":
    case "x":
      return truncate(renderTemplate(xTemplate, t, s, { prompt, platform: "x", seed }), 275);
    case "linkedin":
      return renderTemplate(linkedinTemplate, t, s, {
        prompt,
        platform: "linkedin",
        seed,
      });
    case "tiktok":
      return truncate(`${t}. ${extractSubstance(t, s, seed)}`, 150);
    case "instagram":
      return truncate(`${t}. ${extractSubstance(t, s, seed)}`, 200);
    case "facebook":
      return compactText(`${pickReaction(seed, prompt)} ${t}. ${pickDetail(s)}`);
    default:
      return `${t}\n\n${firstSentence(s)}`;
  }
}

// ─── Template engine ─────────────────────────────────────────────────────

function renderTemplate(
  template: string,
  title: string,
  summary: string,
  options: {
    prompt: PromptConfig;
    platform: "x" | "linkedin";
    seed: number;
  }
) {
  const renderedTitleLower = options.prompt.titleCaseOnX
    ? title
    : title.toLowerCase();

  const usable = isUsableSummary(summary);

  const replacements: Record<string, string> = {
    reaction: pickReaction(options.seed, options.prompt),
    title,
    titleLower: renderedTitleLower,
    summary: usable ? summary : "",
    summarySentence: usable ? ensureSentence(firstSentence(summary)) : "",
    insight: extractSubstance(title, summary, options.seed),
    whyMatters: extractSubstance(title, summary, options.seed),
    detail: pickDetail(summary),
    builderAngle: extractBuilderAngle(title, summary, options.seed),
  };

  const rendered = template.replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, (_match, key) => {
    return replacements[key] ?? "";
  });

  return finalizeCaption(rendered, options.prompt);
}

// ─── Prompt config ───────────────────────────────────────────────────────

function parseTransformationPrompt(prompt: string | undefined): PromptConfig {
  const source = (prompt || "").trim().toLowerCase();

  const opener = source.includes("opener: reaction") ? "reaction" : "none";
  const titleCaseOnX = !source.includes("title_case_on_x: false");
  const bannedPhrasesLine =
    source
      .split("\n")
      .find((line) => line.trim().startsWith("ban_phrases:")) ?? "";
  const bannedPhrases = bannedPhrasesLine
    .replace("ban_phrases:", "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);

  return { opener, titleCaseOnX, bannedPhrases };
}

// ─── Content extraction (replaces canned phrase banks) ───────────────────

/**
 * Extract the most interesting/substantive sentence from the summary.
 * Returns empty string when there's nothing useful to say — the template
 * collapses gracefully instead of inserting filler.
 */
function extractSubstance(title: string, summary: string, seed: number): string {
  if (!isUsableSummary(summary)) return "";

  const sentences = splitSentences(summary);

  // Skip sentences that just repeat the title
  const unique = sentences.filter(
    (s) => !isTitleRepeat(s, title) && s.length > 15
  );

  if (unique.length === 0) return "";

  // Pick the most information-dense sentence (has numbers, names, or specifics)
  const scored = unique.map((s) => ({
    text: s,
    score: sentenceScore(s),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Use seed to vary which top sentence we pick
  const topN = Math.min(3, scored.length);
  const pick = scored[Math.abs(seed) % topN];
  return stripTrailingPeriod(pick.text);
}

/**
 * Extract a builder/developer angle from the summary.
 * Falls back to empty string instead of generic takes.
 */
function extractBuilderAngle(title: string, summary: string, seed: number): string {
  if (!isUsableSummary(summary)) return "";

  const sentences = splitSentences(summary);
  // Look for sentences with technical/builder signals
  const builderSignals = /api|sdk|library|tool|framework|deploy|ship|integration|performance|benchmark|latency|throughput/i;
  const technical = sentences.filter((s) => builderSignals.test(s) && s.length > 15);

  if (technical.length > 0) {
    return stripTrailingPeriod(technical[Math.abs(seed) % technical.length]);
  }

  // Fall back to best substance
  return extractSubstance(title, summary, seed + 3);
}

/**
 * Score a sentence by information density.
 * Higher score = more specific/interesting.
 */
function sentenceScore(s: string): number {
  let score = 0;
  // Numbers are specific
  if (/\d/.test(s)) score += 3;
  // Quoted text is specific
  if (/["']/.test(s)) score += 2;
  // Named entities (capitalized words not at start)
  const namedEntities = s.match(/(?<=\s)[A-Z][a-z]+/g);
  if (namedEntities) score += namedEntities.length;
  // Technical terms
  if (/api|sdk|model|benchmark|gpu|token|inference|latency|throughput/i.test(s)) score += 2;
  // Comparison words
  if (/faster|slower|better|worse|larger|smaller|more|less|vs\b|compared/i.test(s)) score += 2;
  // Longer sentences tend to have more info (up to a point)
  score += Math.min(s.length / 40, 3);
  return score;
}

function isTitleRepeat(sentence: string, title: string): boolean {
  const normS = sentence.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const normT = title.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (normS === normT) return true;
  // Check if sentence is >80% overlap with title
  const sWords = new Set(normS.split(/\s+/));
  const tWords = normT.split(/\s+/);
  const overlap = tWords.filter((w) => sWords.has(w)).length;
  return overlap / Math.max(tWords.length, 1) > 0.8;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0);
}

// ─── Simple pickers (kept for non-substance tokens) ─────────────────────

function pickReaction(seed: number, prompt: PromptConfig): string {
  if (prompt.opener === "none") return "";
  return seededPick(["worth noting.", "one to watch.", "notable shift."], seed);
}

function pickDetail(summary: string): string {
  if (!isUsableSummary(summary)) return "";
  return firstSentence(summary);
}

// ─── Utilities ───────────────────────────────────────────────────────────

function extractStatLine(source: string): string {
  const stat = source.match(/\b\d[\d,.]*\s?(?:billion|million|thousand|x|%|tokens?|models?|gpus?)\b/i);
  if (stat?.[0]) return `${stat[0]} in the middle of it`;
  return "builder angle, not press release";
}

function verbalize(title: string): string {
  const lower = title.toLowerCase();
  if (lower.startsWith("how")) return lower;
  if (lower.includes("launch")) return `launched ${lower.replace(/.*launch\w*\s*/i, "")}`;
  if (lower.includes("releas")) return `released ${lower.replace(/.*releas\w*\s*/i, "")}`;
  return `dropped ${lower}`;
}

function seededPick<T>(items: T[], seed: number): T {
  const index = Math.abs(seed) % items.length;
  return items[index];
}

function firstSentence(s: string): string {
  const m = s.match(/^[^.!?]+[.!?]/);
  return m ? m[0].trim() : s.slice(0, 200).trim();
}

function ensureSentence(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

function shorten(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}

function fallbackBullet(index: number, title: string): string {
  const fallbacks = [
    extractSubstance(title, "", index),
    extractBuilderAngle(title, "", index),
    "",
    "",
  ].filter(Boolean);
  return fallbacks[index] || "";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

function stripTrailingPeriod(value: string) {
  return value.replace(/[.!?]+$/g, "").trim();
}

function compactText(value: string) {
  return value.replace(/\s+/g, " ").replace(/\s+\./g, ".").trim();
}

function finalizeCaption(value: string, prompt: PromptConfig) {
  let next = value.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n");
  next = next
    .split("\n")
    .map((line) => compactText(line))
    .join("\n");

  for (const phrase of prompt.bannedPhrases) {
    if (!phrase) continue;
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(escaped, "ig"), "");
  }

  return next
    .replace(/[ \t]+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.\s+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\W+/, "")
    .trim();
}
