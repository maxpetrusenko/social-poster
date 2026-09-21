import "server-only";

import { callChatCompletions } from "@/lib/chat-completions";
import { callOpenAIResponses, type LangSmithTrace } from "@/lib/langsmith";
import { resolveWritingRuntimes, type WritingRuntime } from "@/lib/model-runtime";

export type WritingModelSlot = "writing" | "reply" | "agent" | "fast" | "image" | "embedding";

export type WritingModelCall = {
  /** LangSmith run name, e.g. "pipeline-human-post-drafts". */
  name: string;
  prompt: string;
  /** Model used when the OpenAI credential is the one that answers. */
  fallbackModel: string;
  workspaceId?: string | null;
  slot?: WritingModelSlot;
  /** Ask for a JSON object response. */
  json?: boolean;
  maxTokens?: number;
  /** Forwarded only to the Responses API provider. */
  reasoning?: { effort: "low" | "medium" | "high" };
  signal?: AbortSignal;
  tags?: string[];
  metadata?: Record<string, unknown>;
  /** Explicit ordered runtimes; skips credential resolution when provided. */
  runtimes?: WritingRuntime[];
};

export type WritingModelResult = {
  /** Always Responses-API shaped so existing extractors keep working. */
  data: Record<string, unknown>;
  text: string;
  runtime: WritingRuntime;
  trace: LangSmithTrace | null;
};

export class WritingModelError extends Error {
  failures: string[];

  constructor(message: string, failures: string[] = []) {
    super(message);
    this.name = "WritingModelError";
    this.failures = failures;
  }
}

export function extractResponsesText(data: Record<string, unknown>): string {
  const output = Array.isArray(data.output) ? (data.output as Array<Record<string, unknown>>) : [];
  const message = output.find((block) => block.type === "message");
  const content = (message?.content as Array<Record<string, unknown>> | undefined) ?? [];
  return content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function toResponsesShape(text: string): Record<string, unknown> {
  return { output: [{ type: "message", content: [{ type: "output_text", text }] }] };
}

/**
 * Calls the first writing model that answers: DeepSeek chat completions first,
 * then the OpenAI Responses API. Providers that fail are skipped, so a dead
 * OpenAI balance no longer takes every writing lane down with it.
 */
export async function callWritingModel(input: WritingModelCall): Promise<WritingModelResult> {
  const runtimes =
    input.runtimes ??
    (await resolveWritingRuntimes({
      workspaceId: input.workspaceId ?? null,
      fallbackModel: input.fallbackModel,
      slot: input.slot ?? "writing",
    }));

  if (runtimes.length === 0) {
    throw new WritingModelError("No writing model credentials available");
  }

  const failures: string[] = [];

  for (const runtime of runtimes) {
    try {
      if (runtime.protocol === "openai_chat") {
        const { text } = await callChatCompletions({
          name: input.name,
          apiKey: runtime.apiKey,
          baseUrl: runtime.baseUrl,
          model: runtime.model,
          prompt: input.prompt,
          jsonMode: input.json,
          maxTokens: input.maxTokens,
          signal: input.signal,
          tags: input.tags,
          metadata: { ...input.metadata, modelSource: runtime.source, provider: runtime.provider },
        });
        return { data: toResponsesShape(text), text, runtime, trace: null };
      }

      const result = await callOpenAIResponses<Record<string, unknown>>({
        name: input.name,
        apiKey: runtime.apiKey,
        body: {
          model: runtime.model,
          input: input.prompt,
          ...(input.json ? { text: { format: { type: "json_object" } } } : {}),
          ...(input.reasoning ? { reasoning: input.reasoning } : {}),
        },
        signal: input.signal,
        tags: input.tags,
        metadata: {
          ...input.metadata,
          modelSource: runtime.source,
          provider: runtime.provider,
        },
      });

      const text = extractResponsesText(result.data);
      if (!text) throw new Error("empty response from provider");
      return { data: result.data, text, runtime, trace: result.trace ?? null };
    } catch (err) {
      failures.push(
        `${runtime.provider}/${runtime.model}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  throw new WritingModelError(`All writing models failed: ${failures.join(" | ")}`, failures);
}
