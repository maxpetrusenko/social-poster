import { z } from "zod";
import { uniqueReplyDrafts } from "@/lib/replies/duplicate-guard";
import type { ReplyDirection } from "@/lib/replies/strategy";
import { callOpenAIResponses } from "@/lib/langsmith";

const DEFAULT_REPLY_MODEL = process.env.OPENAI_REPLY_MODEL || "gpt-5-mini";
const DEFAULT_PRODUCT_NAME = process.env.REPLY_PRODUCT_NAME || "Agent Persona";
const DEFAULT_PRODUCT_DESCRIPTOR =
  process.env.REPLY_PRODUCT_DESCRIPTOR || "agent persona framework";
const DEFAULT_PRODUCT_URL = process.env.REPLY_PRODUCT_URL || "agent-persona.org";
const DEFAULT_GITHUB_REPO =
  process.env.REPLY_GITHUB_REPO || "github.com/agent-persona/personas-pipeline";

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
  threadContext?: string[];
  tags: string[];
  direction: ReplyDirection;
  profileId?: string;
  profileLabel?: string;
  profileGoal?: string;
  profileDestination?: string;
  likes: number;
  views: string;
  contextLabel?: string;
};

type ReplyDraftMode = "primary" | "fallback";

export async function generateAiReplyDraftsBatch(
  candidates: ReplyDraftCandidate[],
  mode: ReplyDraftMode = "primary"
): Promise<Map<string, string[]>> {
  if (candidates.length === 0) return new Map();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const result = await callOpenAIResponses<Record<string, unknown>>({
    name: "reply-draft-generation",
    apiKey,
    body: {
      model: DEFAULT_REPLY_MODEL,
      reasoning: { effort: "low" },
      input: buildPrompt(candidates, mode),
    },
    signal: AbortSignal.timeout(45_000),
    tags: ["replies", mode],
    metadata: {
      candidateCount: candidates.length,
      mode,
    },
  });

  const outputText = extractOutputText(result.data);
  const parsed = responseSchema.parse(extractJsonObject(outputText));

  const byTweetId = new Map<string, string[]>();

  for (const candidate of candidates) {
    const drafts =
      parsed.replies.find((entry) => entry.tweetId === candidate.tweetId)?.drafts ?? [];
    byTweetId.set(candidate.tweetId, normalizeDrafts(drafts));
  }

  return byTweetId;
}

function buildPrompt(candidates: ReplyDraftCandidate[], mode: ReplyDraftMode) {
  const isFallback = mode === "fallback";

  return [
    "You write high-signal X replies for Max Petrusenko.",
    "Sound like a sharp founder-operator on X, not a growth bot, brand account, consultant, or assistant.",
    "Return strict JSON with shape {\"replies\":[{\"tweetId\":\"...\",\"drafts\":[\"...\",\"...\",\"...\"]}]} and nothing else.",
    "Rules:",
    "- reply to the original post only; do not invent missing thread context",
    "- 1 sentence preferred, 2 max",
    isFallback ? "- aim for 10-28 words; max 220 characters per draft" : "- aim for 12-32 words; max 220 characters per draft",
    "- concrete observation, reframing, crisp disagreement, sharp test, or sharp question",
    "- prefer one specific mechanism, tradeoff, or failure mode over broad commentary",
    "- write like a native X user: plain words, tight phrasing, no essay cadence",
    "- no praise openers like 'great point', 'totally', 'love this'",
    "- no emojis, no hashtags, no sales pitch",
    "- no consultant/academic phrasing like 'auditable provenance', 'systematic divergences', 'market-based arbitration', 'calibrated uncertainty'",
    "- no semicolons, no em dashes, no list formatting",
    "- avoid just restating the tweet; add a useful angle",
    isFallback
      ? "- only skip tragic, personal-crisis, politics, legal, medical, or clearly irrelevant posts; otherwise prefer one sharp question over returning drafts: []"
      : "- skip low-signal, tragic, personal-crisis, politics, legal, medical, or obviously off-lane posts by returning drafts: []",
    "- drafts should feel distinct, not near-duplicates",
    "- if you can ask a sharper question than make a statement, do that",
    isFallback
      ? "- fallback mode: if unsure, produce one concrete question that probes mechanism, failure mode, metrics, or tradeoffs instead of returning nothing"
      : "- if a post is adjacent but not perfect, only answer if you can add a concrete angle",
    "- each candidate may include an active Agent Persona profile; when present, honor its goal and destination without forcing a pitch",
    "- lane behavior:",
    `  - product: bridge the pain or failure mode to a concrete use case for ${DEFAULT_PRODUCT_NAME}; at most one draft can softly mention ${DEFAULT_PRODUCT_DESCRIPTOR} or ${DEFAULT_PRODUCT_URL}`,
    `  - dev: earn technical trust first; no generic product pitch; only mention ${DEFAULT_PRODUCT_NAME} if the mechanism directly overlaps and phrase it as build experience, not marketing`,
    `  - github: at least one draft should naturally point to ${DEFAULT_GITHUB_REPO}; direct repo mention is allowed in one draft only`,
    "- for dev and github lanes, prefer mechanism first and CTA second",
    "- if mentioning Agent Persona, be specific about why: replay, state, persona, evals, or debugging",
    "- do not force a product or repo mention if the tweet is clearly unrelated",
    "- if threadContext is present, use it to understand the author's full argument before replying",
    "",
    "Candidates:",
    JSON.stringify(
      candidates.map((candidate) => ({
        tweetId: candidate.tweetId,
        author: candidate.author,
        text: candidate.text,
        threadContext: candidate.threadContext ?? null,
        tags: candidate.tags,
        direction: candidate.direction,
        profileId: candidate.profileId ?? null,
        profileLabel: candidate.profileLabel ?? null,
        profileGoal: candidate.profileGoal ?? null,
        profileDestination: candidate.profileDestination ?? null,
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
