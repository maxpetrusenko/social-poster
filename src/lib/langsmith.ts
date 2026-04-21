import "server-only";
import { Client } from "langsmith";
import { traceable } from "langsmith/traceable";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_LANGSMITH_PROJECT = "clawPoster";

export type LangSmithTrace = {
  runId: string;
  project: string;
  url: string | null;
};

type OpenAIResponsesBody = {
  model: string;
  input: unknown;
  reasoning?: unknown;
  text?: unknown;
};

type OpenAIResponsesCall = {
  name: string;
  apiKey: string;
  body: OpenAIResponsesBody;
  signal?: AbortSignal;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export class OpenAIResponsesError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`OpenAI API error: ${status} ${body.slice(0, 200)}`);
    this.status = status;
    this.body = body;
  }
}

export function getLangSmithProject() {
  return process.env.LANGSMITH_PROJECT || process.env.LANGCHAIN_PROJECT || DEFAULT_LANGSMITH_PROJECT;
}

function getLangSmithApiKey() {
  return process.env.LANGSMITH_API_KEY || process.env.LANGCHAIN_API_KEY || "";
}

function shouldTraceLangSmith() {
  if (process.env.LANGSMITH_TRACING === "false") return false;
  if (process.env.LANGCHAIN_TRACING_V2 === "false") return false;
  return Boolean(getLangSmithApiKey());
}

async function resolveTraceUrl(runId: string | null): Promise<string | null> {
  if (!runId || !shouldTraceLangSmith()) return null;

  try {
    const client = new Client({
      apiKey: getLangSmithApiKey(),
      apiUrl: process.env.LANGSMITH_ENDPOINT || process.env.LANGCHAIN_ENDPOINT,
    });
    return await client.getRunUrl({
      runId,
      projectOpts: { projectName: getLangSmithProject() },
    });
  } catch {
    return null;
  }
}

function traceInputs(input: OpenAIResponsesCall) {
  return {
    name: input.name,
    model: input.body.model,
    input: input.body.input,
    reasoning: input.body.reasoning ?? null,
    text: input.body.text ?? null,
    metadata: input.metadata ?? {},
  };
}

export async function callOpenAIResponses<T extends Record<string, unknown>>(
  input: OpenAIResponsesCall
): Promise<{ data: T; trace: LangSmithTrace | null }> {
  let runId: string | null = null;
  const project = getLangSmithProject();

  const tracedCall = traceable(
    async (call: OpenAIResponsesCall) => {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${call.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(call.body),
        signal: call.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new OpenAIResponsesError(response.status, text);
      }

      return JSON.parse(text) as T;
    },
    {
      name: input.name,
      run_type: "llm",
      project_name: project,
      tracingEnabled: shouldTraceLangSmith(),
      tags: ["openai", "responses", ...(input.tags ?? [])],
      metadata: {
        ls_provider: "openai",
        ls_model_name: input.body.model,
        ...input.metadata,
      },
      processInputs: traceInputs,
      getInvocationParams: (call) => ({
        ls_provider: "openai",
        ls_model_name: call.body.model,
        ls_model_type: "llm",
      }),
      on_start: (runTree) => {
        runId = runTree?.id ?? null;
      },
    }
  );

  const data = await tracedCall(input);
  const url = await resolveTraceUrl(runId);

  return {
    data,
    trace: runId ? { runId, project, url } : null,
  };
}
