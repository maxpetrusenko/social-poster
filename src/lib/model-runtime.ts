import "server-only";

import { resolveWorkspaceModelConfig } from "@/lib/model-providers";

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
