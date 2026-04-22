export const MODEL_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "gemini",
  "xai",
  "openrouter",
  "custom",
] as const;

export type ModelProviderId = (typeof MODEL_PROVIDER_IDS)[number];

export type ModelCapability =
  | "text"
  | "vision"
  | "tools"
  | "image"
  | "audio"
  | "embeddings";

export type DiscoveredModel = {
  modelId: string;
  displayName: string;
  capabilities: ModelCapability[];
  contextWindow?: number | null;
  inputPrice?: string | null;
  outputPrice?: string | null;
  source: "discovered" | "curated" | "manual";
  metadata?: Record<string, unknown>;
};

export type ProviderDefinition = {
  id: ModelProviderId;
  label: string;
  defaultBaseUrl: string;
  defaultProtocol: string;
  envKeys: string[];
  description: string;
};

export const MODEL_PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com",
    defaultProtocol: "openai_responses",
    envKeys: ["OPENAI_API_KEY"],
    description: "GPT models for writing, agents, tools, vision, and image generation.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultProtocol: "anthropic_messages",
    envKeys: ["ANTHROPIC_API_KEY"],
    description: "Claude models for long-context writing, reasoning, and analysis.",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultProtocol: "gemini_generate_content",
    envKeys: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "GOOGLE_API_KEY"],
    description: "Gemini models for fast multimodal drafting and structured generation.",
  },
  {
    id: "xai",
    label: "xAI",
    defaultBaseUrl: "https://api.x.ai",
    defaultProtocol: "openai_chat",
    envKeys: ["XAI_API_KEY", "GROK_API_KEY"],
    description: "Grok models through OpenAI-compatible chat endpoints.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api",
    defaultProtocol: "openai_chat",
    envKeys: ["OPENROUTER_API_KEY"],
    description: "One key for many providers, with model catalog metadata.",
  },
  {
    id: "custom",
    label: "Custom Endpoint",
    defaultBaseUrl: "",
    defaultProtocol: "openai_chat",
    envKeys: [],
    description: "OpenAI-compatible or manually managed model endpoint.",
  },
];

export const CURATED_MODELS: Record<ModelProviderId, DiscoveredModel[]> = {
  openai: [
    curated("gpt-5.4", "GPT-5.4", ["text", "vision", "tools"]),
    curated("gpt-5.4-mini", "GPT-5.4 Mini", ["text", "vision", "tools"]),
    curated("gpt-5.4-nano", "GPT-5.4 Nano", ["text", "tools"]),
  ],
  anthropic: [
    curated("claude-opus-4-6", "Claude Opus 4.6", ["text", "vision", "tools"]),
    curated("claude-sonnet-4-6", "Claude Sonnet 4.6", ["text", "vision", "tools"]),
    curated("claude-haiku-4-5", "Claude Haiku 4.5", ["text", "vision", "tools"]),
  ],
  gemini: [
    curated("gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", ["text", "vision", "tools"]),
    curated("gemini-3.1-flash-image-preview", "Gemini 3.1 Flash Image Preview", ["text", "vision", "image"]),
    curated("gemini-2.5-flash-image", "Gemini 2.5 Flash Image", ["text", "vision", "image"]),
    curated("gemini-3-flash", "Gemini 3 Flash", ["text", "vision", "tools"]),
    curated("gemini-3.1-flash-lite-preview", "Gemini 3.1 Flash-Lite Preview", ["text", "vision"]),
  ],
  xai: [
    curated("grok-4.2-fast", "Grok 4.2 Fast", ["text", "vision", "tools"]),
    curated("grok-4.2", "Grok 4.2", ["text", "vision", "tools"]),
  ],
  openrouter: [],
  custom: [],
};

function curated(
  modelId: string,
  displayName: string,
  capabilities: ModelCapability[]
): DiscoveredModel {
  return { modelId, displayName, capabilities, source: "curated" };
}

export function providerDefinition(provider: string) {
  return MODEL_PROVIDERS.find((item) => item.id === provider) ?? MODEL_PROVIDERS[5];
}

export function isModelProviderId(value: unknown): value is ModelProviderId {
  return typeof value === "string" && MODEL_PROVIDER_IDS.includes(value as ModelProviderId);
}
