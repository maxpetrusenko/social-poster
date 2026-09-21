import "server-only";
import { traceable } from "langsmith/traceable";

const DEFAULT_CHAT_TIMEOUT_MS = 90_000;
const DEFAULT_MAX_TOKENS = 4000;

export class ChatCompletionsError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Chat completions API error: ${status} ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export type ChatCompletionsCall = {
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

type ChatCompletionsResponse = {
  choices?: Array<{ message?: { content?: string | null } | null }>;
};

function getLangSmithProject() {
  return process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || "clawPoster";
}

function shouldTraceLangSmith() {
  if (process.env.LANGSMITH_TRACING === "false") return false;
  if (process.env.LANGCHAIN_TRACING_V2 === "false") return false;
  return Boolean(process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY);
}

function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

/**
 * OpenAI-compatible chat completions call. Used for providers that speak the chat
 * completions protocol (DeepSeek) instead of the OpenAI Responses API.
 */
export async function callChatCompletions(
  input: ChatCompletionsCall
): Promise<{ text: string }> {
  const tracedCall = traceable(
    async (call: ChatCompletionsCall) => {
      const body: Record<string, unknown> = {
        model: call.model,
        messages: [{ role: "user", content: call.prompt }],
        max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
      };
      if (typeof call.temperature === "number") body.temperature = call.temperature;
      if (call.jsonMode) body.response_format = { type: "json_object" };

      const response = await fetch(chatCompletionsUrl(call.baseUrl), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${call.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: call.signal ?? AbortSignal.timeout(DEFAULT_CHAT_TIMEOUT_MS),
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new ChatCompletionsError(response.status, raw);
      }

      let parsed: ChatCompletionsResponse;
      try {
        parsed = JSON.parse(raw) as ChatCompletionsResponse;
      } catch {
        throw new ChatCompletionsError(response.status, raw);
      }

      const content = parsed.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        // Empty content in JSON mode is a provider failure, not a valid draft.
        throw new ChatCompletionsError(response.status, raw);
      }

      return content;
    },
    {
      name: input.name,
      run_type: "llm",
      project_name: getLangSmithProject(),
      tracingEnabled: shouldTraceLangSmith(),
      tags: ["chat-completions", "model-writing", ...(input.tags ?? [])],
      metadata: {
        ls_provider: "chat-completions",
        ls_model_name: input.model,
        base_url: input.baseUrl,
        ...input.metadata,
      },
      processInputs: (call: ChatCompletionsCall) => ({
        name: call.name,
        model: call.model,
        base_url: call.baseUrl,
        prompt: call.prompt,
        json_mode: Boolean(call.jsonMode),
        metadata: call.metadata ?? {},
      }),
      getInvocationParams: (call: ChatCompletionsCall) => ({
        ls_provider: "chat-completions",
        ls_model_name: call.model,
        ls_model_type: "llm",
      }),
    }
  );

  const text = await tracedCall(input);
  return { text };
}
