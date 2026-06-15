import "server-only";

import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";
import { X_POSTING_SKILL_INSTRUCTIONS } from "@/lib/x-posting-skill";

const DEFAULT_MODEL = process.env.OPENAI_SOCIAL_POST_MODEL || "gpt-4.1-mini";
const MAX_ATTEMPTS = 3;
const X_SAFE_CHAR_LIMIT = 1200;
const X_MEDIA_SAFE_CHAR_LIMIT = 600;

const GENERIC_PHRASES = [
  "builder signal",
  "winning coding setup",
  "workflow changes show up",
  "looks worth testing inside a real workflow",
  "the account becomes the api key",
  "the agent becomes the interface",
  "the model becomes a routing choice",
  "durable asset is the workflow loop",
];

function normalizeComparableText(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export class XLikedAutopostWriterError extends Error {
  code: "runtime_unavailable" | "invalid_response" | "quality_rejected" | "api_error";
  fatal: boolean;

  constructor(
    message: string,
    options: {
      code: XLikedAutopostWriterError["code"];
      fatal?: boolean;
      cause?: unknown;
    }
  ) {
    super(message);
    this.name = "XLikedAutopostWriterError";
    this.code = options.code;
    this.fatal = options.fatal ?? false;
    this.cause = options.cause;
  }
}

export type XLikedAutopostWriterResult = {
  content: string;
  model: string;
  modelSource: string;
  traceUrl: string | null;
};

export async function draftXLikedAutopostContent(input: {
  workspaceId: string;
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  externalUrls?: string[];
  hasMedia: boolean;
  mediaType: "image" | "video" | null;
}): Promise<XLikedAutopostWriterResult> {
  const runtime = await resolveOpenAIResponsesRuntime({
    workspaceId: input.workspaceId,
    slot: "writing",
    fallbackModel: DEFAULT_MODEL,
  });

  if (!runtime.apiKey) {
    throw new XLikedAutopostWriterError("OpenAI writing runtime unavailable", {
      code: "runtime_unavailable",
      fatal: true,
    });
  }

  try {
    let lastRejection = "";
    let lastTraceUrl: string | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const result = await callOpenAIResponses<Record<string, unknown>>({
        name: attempt === 1
          ? "x-liked-autopost-writer"
          : "x-liked-autopost-writer-retry",
        apiKey: runtime.apiKey,
        body: {
          model: runtime.model,
          input: buildXLikedAutopostWriterPrompt({
            ...input,
            previousRejection: lastRejection || null,
          }),
          text: { format: { type: "json_object" } },
        },
        tags: ["x-liked-autopost", "writer"],
        metadata: {
          source: "x-liked-autopost",
          sourceUrl: input.sourceUrl,
          authorHandle: input.authorHandle,
          mediaType: input.mediaType,
          modelSource: runtime.source ?? "unknown",
          attempt,
        },
      });

      lastTraceUrl = result.trace?.url ?? null;
      const content = parseWriterResponse(result.data);
      const rejection = getXLikedAutopostContentRejection({
        content,
        sourceText: input.sourceText,
        externalUrls: input.externalUrls,
        hasMedia: input.hasMedia,
        sourceUrl: input.sourceUrl,
      });

      if (!rejection) {
        return {
          content,
          model: runtime.model,
          modelSource: runtime.source ?? "unknown",
          traceUrl: lastTraceUrl,
        };
      }

      lastRejection = rejection;
    }

    throw new XLikedAutopostWriterError(lastRejection || "writer quality rejected", {
      code: "quality_rejected",
    });
  } catch (error) {
    if (error instanceof XLikedAutopostWriterError) throw error;
    throw new XLikedAutopostWriterError(
      error instanceof Error ? error.message : String(error),
      {
        code: "api_error",
        fatal: true,
        cause: error,
      }
    );
  }
}

export function buildXLikedAutopostWriterPrompt(input: {
  authorHandle: string;
  sourceUrl: string;
  sourceText: string;
  externalUrls?: string[];
  hasMedia: boolean;
  mediaType: "image" | "video" | null;
  previousRejection?: string | null;
}) {
  const retryInstruction = input.previousRejection
    ? `\nPrevious draft failed: ${input.previousRejection}\nRewrite the draft to satisfy that issue while preserving the source's concrete point.\n`
    : "";

  return `You write Max Petrusenko's liked-post autoposts.

Use these X posting rules as binding instructions:
${X_POSTING_SKILL_INSTRUCTIONS}

Task:
Write one post for Max based on a liked X post.

Source author: ${input.authorHandle || "unknown"}
Source URL: ${input.sourceUrl}
External URLs recovered from source metadata:
${input.externalUrls?.length ? input.externalUrls.map((url) => `- ${url}`).join("\n") : "(none)"}
Media: ${input.mediaType ?? "none"}
Source text:
${input.sourceText || "(empty)"}

Rules for this draft:
- The output is the main post text only.
- For text-only reposts, keep the original train of thought: same paragraph order, same causal chain, same conclusion.
- If the source is already clear and under budget, do a light edit only. Change roughly 5-15 words, keep the source's formatting/pacing, and preserve its key nouns.
- Do not return the source verbatim. The post should read like a careful Max curation pass, not a copy/paste.
- Preserve the source's frame, metaphor, numbers, named concepts, and ending. Do not replace them with generic commentary.
- For copied media, include a compact take. The platform formatter adds video/embed attribution separately.
- Omit the source URL for text-only opinion/compression.
- Keep useful GitHub URLs when the source is a repo/bookmark lane.
- Attribute source-owned launches to the source account.
- Do not claim Max built, launched, tried, or discovered something without evidence in the source text.
- If the source uses first person and the author is not Max, do not copy "I", "my", "we", or "our" into Max's voice. Translate it into a Max-owned workflow rule, concrete mechanism, or source-attributed observation.
- If the source mentions a study, paper, research, experiment, or participant count, include the primary study URL from the recovered external URLs when one is available.
- Write one standalone post. No thread markers such as 1/2.
- Avoid generic phrases such as "builder signal", "winning coding setup", "workflow loop", "game-changing", "cutting-edge", "unlock", and "redefine".
- Hard length budget: ${input.hasMedia ? X_MEDIA_SAFE_CHAR_LIMIT : X_SAFE_CHAR_LIMIT} characters. Count all characters.
${retryInstruction}

Respond with JSON only:
{
  "content": "post text"
}`;
}

export function parseWriterResponse(data: Record<string, unknown>) {
  const output = Array.isArray(data.output)
    ? (data.output as Array<Record<string, unknown>>)
    : [];
  const message = output.find((block) => block.type === "message");
  const text =
    ((message?.content as Array<Record<string, unknown>> | undefined)?.[0]?.text as string) ?? "";

  if (!text.trim()) {
    throw new XLikedAutopostWriterError("Writer returned empty response", {
      code: "invalid_response",
    });
  }

  const parsed = JSON.parse(text) as { content?: unknown };
  const content = typeof parsed.content === "string" ? parsed.content.trim() : "";
  if (!content) {
    throw new XLikedAutopostWriterError("Writer returned empty content", {
      code: "invalid_response",
    });
  }

  return content
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export function getXLikedAutopostContentRejection(input: {
  content: string;
  sourceText: string;
  externalUrls?: string[];
  hasMedia: boolean;
  sourceUrl: string;
}) {
  const content = input.content.trim();
  const normalized = content.toLowerCase();
  const source = input.sourceText.toLowerCase();

  if (!content) return "writer returned empty content";
  if (content.length > (input.hasMedia ? X_MEDIA_SAFE_CHAR_LIMIT : X_SAFE_CHAR_LIMIT)) {
    return `writer exceeded ${input.hasMedia ? X_MEDIA_SAFE_CHAR_LIMIT : X_SAFE_CHAR_LIMIT} character budget`;
  }
  if (/^1\s*\/\s*2\b/m.test(content)) return "writer returned thread numbering";
  if (/\bsource:\s*/i.test(content)) return "writer included source label";

  if (!input.hasMedia && content.includes(input.sourceUrl)) {
    return "writer included source URL for text-only repost";
  }
  if (!input.hasMedia && normalizeComparableText(content) === normalizeComparableText(input.sourceText)) {
    return "writer returned source verbatim";
  }

  if (hasSourceOwnedFirstPerson(input.sourceText) && hasSourceOwnedFirstPerson(content)) {
    return "writer copied source-owned first person into Max voice";
  }

  const primaryStudyUrl = pickPrimaryStudyUrl(input.externalUrls ?? []);
  if (
    primaryStudyUrl &&
    looksLikeStudyClaim(input.sourceText) &&
    !content.includes(primaryStudyUrl)
  ) {
    return "writer omitted recovered primary study URL";
  }

  const generic = GENERIC_PHRASES.find((phrase) => normalized.includes(phrase));
  if (generic) return `writer used generic phrase: ${generic}`;

  if (/\bprefrontal cortex\b/.test(source) && /\bcerebellum\b/.test(source)) {
    if (!/\bprefrontal cortex\b/i.test(content) || !/\bcerebellum\b/i.test(content)) {
      return "writer lost the source metaphor";
    }
  }

  if (/\bbumblebee scanner\b/.test(source) || /\bsupply-chain surprises\b/.test(source)) {
    if (!/\bbumblebee\b/i.test(content) && !/\bsupply-chain\b/i.test(content)) {
      return "writer lost the concrete demo hook";
    }
  }

  const trainOfThoughtTerms = [
    ["answer key", /\banswer key\b/i],
    ["commodity", /\bcommodity\b/i],
    ["new training", /\bnew training\b/i],
    ["new land", /\bnew land\b/i],
  ] as const;
  if (trainOfThoughtTerms.filter(([, pattern]) => pattern.test(source)).length >= 3) {
    const missing = trainOfThoughtTerms
      .filter(([, pattern]) => pattern.test(source) && !pattern.test(content))
      .map(([label]) => label);
    if (missing.length > 0) {
      return `writer lost train-of-thought terms: ${missing.join(", ")}`;
    }
  }

  return null;
}

function hasSourceOwnedFirstPerson(text: string) {
  return /\b(I|I'm|I’m|I've|I’ve|my|we|we're|we’re|we've|we’ve|our)\b/.test(text);
}

function looksLikeStudyClaim(text: string) {
  return /\b(study|paper|research|participants|people|subjects|respondents|experiment|arxiv|doi)\b/i.test(text);
}

function pickPrimaryStudyUrl(urls: string[]) {
  return urls.find((url) =>
    /\b(arxiv\.org|doi\.org|papers\.ssrn\.com|openreview\.net|nature\.com|science\.org|acm\.org|ieee\.org)\b/i.test(url)
  ) ?? null;
}
