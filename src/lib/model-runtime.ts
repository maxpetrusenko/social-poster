import "server-only";

import { resolveWorkspaceModelConfig } from "@/lib/model-providers";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

type WritingRuntimeBase = {
  provider: "deepseek" | "openai";
  apiKey: string;
  model: string;
  source: "env" | "workspace";
};

export type WritingRuntime =
  | (WritingRuntimeBase & { protocol: "openai_chat"; baseUrl: string })
  | (WritingRuntimeBase & { protocol: "openai_responses"; baseUrl?: string });

export async function resolveOpenAIResponsesRuntime(input: {
  workspaceId: string;
  slot: "writing" | "reply" | "agent" | "fast" | "image" | "embedding";
  fallbackModel: string;
}) {
  const configured = await resolveWorkspaceModelConfig(input.workspaceId, input.slot).catch(
    () => null
  );
  if (
    configured &&
    configured.provider === "openai" &&
    configured.protocol === "openai_responses"
  ) {
    return {
      apiKey: configured.apiKey,
      model: configured.model,
      source: "workspace" as const,
    };
  }

  return {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: input.fallbackModel,
    source: "env" as const,
  };
}

/**
 * Ordered writing-model candidates. DeepSeek (chat completions) first, OpenAI
 * (Responses API) second. Callers walk the list and fall back to the next entry
 * when a provider fails, so one dead account cannot silently degrade the draft.
 */
export async function resolveWritingRuntimes(input: {
  workspaceId: string | null;
  fallbackModel: string;
  slot?: "writing" | "reply" | "agent" | "fast" | "image" | "embedding";
}): Promise<WritingRuntime[]> {
  const runtimes: WritingRuntime[] = [];

  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  if (deepseekKey) {
    runtimes.push({
      provider: "deepseek",
      protocol: "openai_chat",
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_SOCIAL_POST_MODEL || DEFAULT_DEEPSEEK_MODEL,
      baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
      source: "env",
    });
  }

  if (input.workspaceId) {
    const configured = await resolveWorkspaceModelConfig(
      input.workspaceId,
      input.slot ?? "writing"
    ).catch(() => null);
    if (
      configured &&
      configured.provider === "openai" &&
      configured.protocol === "openai_responses"
    ) {
      runtimes.push({
        provider: "openai",
        protocol: "openai_responses",
        apiKey: configured.apiKey,
        model: configured.model,
        source: "workspace",
      });
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY || "";
  if (openaiKey && !runtimes.some((runtime) => runtime.provider === "openai")) {
    runtimes.push({
      provider: "openai",
      protocol: "openai_responses",
      apiKey: openaiKey,
      model: input.fallbackModel,
      source: "env",
    });
  }

  return runtimes;
}
