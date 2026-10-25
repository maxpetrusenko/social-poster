import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/langsmith", () => ({ callOpenAIResponses: vi.fn() }));
vi.mock("@/lib/chat-completions", () => ({
  callChatCompletions: vi.fn(async () => ({ text: "ok" })),
}));
vi.mock("@/lib/model-runtime", () => ({ resolveWritingRuntimes: vi.fn() }));

import { resolveWritingRuntimes, type WritingRuntime } from "@/lib/model-runtime";
import { callWritingModel } from "@/lib/writing-model";

const DEEPSEEK: WritingRuntime = {
  provider: "deepseek",
  protocol: "openai_chat",
  apiKey: "ds",
  model: "deepseek-flash",
  baseUrl: "https://api.deepseek.com",
  source: "env",
};
const OPENAI: WritingRuntime = {
  provider: "openai",
  protocol: "openai_responses",
  apiKey: "oa",
  model: "gpt-4.1-mini",
  source: "env",
};

describe("callWritingModel for non-reply slots", () => {
  it("still resolves the unfiltered DeepSeek + OpenAI chain", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([DEEPSEEK, OPENAI]);
    const result = await callWritingModel({ name: "blog", prompt: "p", fallbackModel: "gpt-4.1-mini" });
    expect(resolveWritingRuntimes).toHaveBeenCalledWith({
      workspaceId: null,
      fallbackModel: "gpt-4.1-mini",
      slot: "writing",
    });
    expect(result.runtime.provider).toBe("deepseek");
  });
});
