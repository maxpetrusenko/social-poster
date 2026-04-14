import { z } from "zod";
import { uniqueReplyDrafts } from "@/lib/replies/duplicate-guard";

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_REPLY_MODEL = process.env.OPENAI_REPLY_MODEL || "gpt-5-mini";

const responseSchema = z.object({
  replies: z.array(
    z.object({
      tweetId: z.string(),
      drafts: z.array(z.string()).max(3),
    })
  ),
});

export type ReplyDraftCandidate = {
  tweetId: string;
  author: string;
  text: string;
  tags: string[];
  likes: number;
  views: string;
  contextLabel?: string;
};

export async function generateAiReplyDraftsBatch(
  candidates: ReplyDraftCandidate[]
): Promise<Map<string, string[]>> {
  if (candidates.length === 0) return new Map();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_REPLY_MODEL,
      reasoning: { effort: "low" },
      input: buildPrompt(candidates),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const message = extractErrorMessage(payload);
    throw new Error(`OpenAI reply draft generation failed: ${message}`);
  }

  const outputText = extractOutputText(payload);
  const parsed = responseSchema.parse(extractJsonObject(outputText));

  const byTweetId = new Map<string, string[]>();

  for (const candidate of candidates) {
    const drafts =
      parsed.replies.find((entry) => entry.tweetId === candidate.tweetId)?.drafts ?? [];
    byTweetId.set(candidate.tweetId, normalizeDrafts(drafts));
  }

  return byTweetId;
}

function buildPrompt(candidates: ReplyDraftCandidate[]) {
  return [
    "You write high-signal X replies for Max Petrusenko.",
    "Sound like a sharp founder-operator on X, not a growth bot, brand account, consultant, or assistant.",
    "Return strict JSON with shape {\"replies\":[{\"tweetId\":\"...\",\"drafts\":[\"...\",\"...\",\"...\"]}]} and nothing else.",
    "Rules:",
    "- reply to the original post only; do not invent missing thread context",
    "- 1 sentence preferred, 2 max",
    "- aim for 12-32 words; max 220 characters per draft",
    "- concrete observation, reframing, crisp disagreement, sharp test, or sharp question",
    "- prefer one specific mechanism, tradeoff, or failure mode over broad commentary",
    "- write like a native X user: plain words, tight phrasing, no essay cadence",
    "- no praise openers like 'great point', 'totally', 'love this'",
    "- no emojis, no hashtags, no links, no sales pitch, no mention of Max's product",
    "- no consultant/academic phrasing like 'auditable provenance', 'systematic divergences', 'market-based arbitration', 'calibrated uncertainty'",
    "- no semicolons, no em dashes, no list formatting",
    "- avoid just restating the tweet; add a useful angle",
    "- skip low-signal, tragic, personal-crisis, politics, legal, medical, or obviously off-lane posts by returning drafts: []",
    "- drafts should feel distinct, not near-duplicates",
    "- if you can ask a sharper question than make a statement, do that",
    "",
    "Candidates:",
    JSON.stringify(
      candidates.map((candidate) => ({
        tweetId: candidate.tweetId,
        author: candidate.author,
        text: candidate.text,
        tags: candidate.tags,
        likes: candidate.likes,
        views: candidate.views,
        contextLabel: candidate.contextLabel ?? null,
      }))
    ),
  ].join("\n");
}

function normalizeDrafts(drafts: string[]) {
  return uniqueReplyDrafts(
    drafts
      .map((draft) => draft.replace(/\s+/g, " ").trim().replace(/^["'`]+|["'`]+$/g, ""))
      .filter((draft) => draft.length >= 24 && draft.length <= 220)
  ).slice(0, 3);
}

function extractErrorMessage(payload: Record<string, unknown>) {
  const error = payload.error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }

  return "unknown error";
}

function extractOutputText(payload: Record<string, unknown>) {
  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const output = payload.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];

    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;

      for (const entry of content) {
        if (!entry || typeof entry !== "object") continue;
        const text = (entry as { text?: unknown }).text;
        if (typeof text === "string" && text.trim()) parts.push(text.trim());
      }
    }

    if (parts.length > 0) return parts.join("\n");
  }

  throw new Error("OpenAI reply draft generation returned no text output");
}

function extractJsonObject(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`OpenAI reply draft generation returned invalid JSON: ${value}`);
  }

  return JSON.parse(value.slice(start, end + 1));
}
