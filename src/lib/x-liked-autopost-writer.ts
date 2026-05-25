import "server-only";

import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveOpenAIResponsesRuntime } from "@/lib/model-runtime";
import { X_POSTING_SKILL_INSTRUCTIONS } from "@/lib/x-posting-skill";

const DEFAULT_MODEL = process.env.OPENAI_SOCIAL_POST_MODEL || "gpt-4.1-mini";

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
    const result = await callOpenAIResponses<Record<string, unknown>>({
      name: "x-liked-autopost-writer",
      apiKey: runtime.apiKey,
      body: {
        model: runtime.model,
        input: buildXLikedAutopostWriterPrompt(input),
        text: { format: { type: "json_object" } },
      },
      tags: ["x-liked-autopost", "writer"],
      metadata: {
        source: "x-liked-autopost",
        sourceUrl: input.sourceUrl,
        authorHandle: input.authorHandle,
        mediaType: input.mediaType,
        modelSource: runtime.source ?? "unknown",
      },
    });

    const content = parseWriterResponse(result.data);
    const rejection = getXLikedAutopostContentRejection({
      content,
      sourceText: input.sourceText,
      hasMedia: input.hasMedia,
      sourceUrl: input.sourceUrl,
    });

    if (rejection) {
      throw new XLikedAutopostWriterError(rejection, {
        code: "quality_rejected",
      });
    }

    return {
      content,
      model: runtime.model,
      modelSource: runtime.source ?? "unknown",
      traceUrl: result.trace?.url ?? null,
    };
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
  hasMedia: boolean;
  mediaType: "image" | "video" | null;
}) {
  return `You write Max Petrusenko's liked-post autoposts.

Use these X posting rules as binding instructions:
${X_POSTING_SKILL_INSTRUCTIONS}

Task:
Write one post for Max based on a liked X post.

Source author: ${input.authorHandle || "unknown"}
Source URL: ${input.sourceUrl}
Media: ${input.mediaType ?? "none"}
Source text:
${input.sourceText || "(empty)"}

Rules for this draft:
- The output is the main post text only.
- For text-only reposts, stay close to the original: preserve the frame, metaphor, numbers, and ending.
- For copied media, include a compact take. The platform formatter adds video/embed attribution separately.
- Omit the source URL for text-only opinion/compression.
- Keep useful GitHub URLs when the source is a repo/bookmark lane.
- Attribute source-owned launches to the source account.
- Do not claim Max built, launched, tried, or discovered something without evidence in the source text.
- Do not write a thread marker like 1/2 unless the source itself requires a thread.
- Avoid generic phrases such as "builder signal", "winning coding setup", "workflow loop", "game-changing", "cutting-edge", "unlock", and "redefine".

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
  hasMedia: boolean;
  sourceUrl: string;
}) {
  const content = input.content.trim();
  const normalized = content.toLowerCase();
  const source = input.sourceText.toLowerCase();

  if (!content) return "writer returned empty content";
  if (/^1\s*\/\s*2\b/m.test(content)) return "writer returned thread numbering";
  if (/\bsource:\s*/i.test(content)) return "writer included source label";

  if (!input.hasMedia && content.includes(input.sourceUrl)) {
    return "writer included source URL for text-only repost";
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

  return null;
}
