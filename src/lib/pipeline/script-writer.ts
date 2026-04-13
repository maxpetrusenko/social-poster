/**
 * Template voice scripts + social captions.
 * Max voice: personal take first, fragments ok, no hashtags/emoji/BREAKING.
 */

import { cleanRichText } from "./content-clean";

export function writeVoiceScript(story: { title: string; summary: string }): string {
  const t = cleanRichText(story.title);
  const s = cleanRichText(story.summary);

  // Extract a number if present
  const nums = (t + " " + s).match(/\d[\d,.]*[BMK]?/g);
  const numRef = nums?.[0] ? `${nums[0]}` : "";

  // Build ~15-20s script using template variations
  const templates = [
    `${t}. ${numRef ? `${numRef} — ` : ""}this is the part people miss. ${pickInsight(t)}. that's the real unlock.`,
    `so someone just ${verbalize(t)}. ${pickDetail(s)}. ${pickWhyMatters(t)}. been thinking about this one.`,
    `${pickReaction()} ${t.toLowerCase()}. ${pickDetail(s)}. ${pickBuilderAngle(t)}.`,
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
    shorten(sentences[1] || pickWhyMatters(title), 60),
    shorten(sentences[2] || pickBuilderAngle(title), 60),
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

export function writePostCaption(story: { title: string; summary: string }, platform: string): string {
  const t = cleanRichText(story.title);
  const s = cleanRichText(story.summary);

  switch (platform.toLowerCase()) {
    case "twitter":
    case "x":
      // 280 char max, punchy
      return truncate(`${pickReaction()} ${t.toLowerCase()}. ${pickInsight(t)}`, 275);
    case "linkedin":
      return `${pickReaction()} ${t}.\n\n${s ? ensureSentence(firstSentence(s)) : ""}\n\n${pickWhyMatters(t)}.`;
    case "tiktok":
      return truncate(`${t}. ${pickInsight(t)}`, 150);
    case "instagram":
      return truncate(`${t}. ${pickInsight(t)}`, 200);
    case "facebook":
      return `${pickReaction()} ${t}. ${pickDetail(s)}`;
    default:
      return `${t}\n\n${firstSentence(s)}`;
  }
}

function pickReaction(): string {
  const r = ["wild.", "interesting.", "been waiting for this.", "this is it.", "pay attention."];
  return r[Math.floor(Date.now() / 30000) % r.length];
}

function pickInsight(title: string): string {
  if (/open|weight|source|apache|mit/i.test(title)) return "open weights change the whole game";
  if (/billion|million|funding|raised/i.test(title)) return "follow the money, it tells you where the market's going";
  if (/agent|tool|auto/i.test(title)) return "agents that actually work in production are still rare";
  if (/local|on-device|edge/i.test(title)) return "running locally means owning your stack";
  if (/bench|eval|score/i.test(title)) return "benchmarks only tell half the story";
  return "the details here matter more than the headline";
}

function pickWhyMatters(title: string): string {
  if (/open|weight/i.test(title)) return "this matters because control over inference is control over product";
  if (/cost|price|cheap/i.test(title)) return "cost collapse changes who can build";
  return "this shifts what's possible for small teams";
}

function pickBuilderAngle(title: string): string {
  if (/api|sdk|library/i.test(title)) return "shipping something with this next week";
  return "been building around this exact pattern";
}

function pickDetail(summary: string): string {
  if (!summary) return "details still emerging";
  return firstSentence(summary);
}

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
    pickInsight(title),
    pickWhyMatters(title),
    pickBuilderAngle(title),
    "worth watching in prod",
  ];
  return fallbacks[index] || "details matter here";
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}
