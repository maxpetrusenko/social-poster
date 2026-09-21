import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/safe-remote-fetch", () => ({ safeFetchRemote: vi.fn(async () => null) }));
vi.mock("@/lib/langsmith", () => ({ callOpenAIResponses: vi.fn() }));
vi.mock("@/lib/chat-completions", () => ({ callChatCompletions: vi.fn() }));
vi.mock("@/lib/model-runtime", () => ({
  resolveWritingRuntimes: vi.fn(),
  resolveOpenAIResponsesRuntime: vi.fn(),
}));

import { callChatCompletions } from "@/lib/chat-completions";
import { callOpenAIResponses } from "@/lib/langsmith";
import { resolveWritingRuntimes, type WritingRuntime } from "@/lib/model-runtime";
import { draftHumanPostContent } from "../pipeline/human-post-writer.ts";

const DEEPSEEK: WritingRuntime = {
  provider: "deepseek",
  protocol: "openai_chat",
  apiKey: "deepseek-test",
  model: "deepseek-flash",
  baseUrl: "https://api.deepseek.com",
  source: "env",
};

const OPENAI: WritingRuntime = {
  provider: "openai",
  protocol: "openai_responses",
  apiKey: "openai-test",
  model: "gpt-4.1-mini",
  source: "env",
};

const STORY = {
  title: "Show HN: Mini-AGI - Dynamic continual learning model trained on 8GB VRAM",
  summary:
    "The project trains a small model that keeps adapting after the initial run instead of freezing weights once training stops.",
  sourceName: "HN",
  sourceHost: "news.ycombinator.com",
};

const CAPTION =
  "Most continual-learning demos fall apart after the first retrain. This one holds on 8GB of VRAM, which is the part that matters if you run local boxes.";

const DRAFT_JSON = JSON.stringify({
  perspective: "runs on local hardware",
  factsUsed: ["8GB VRAM", "continual learning"],
  contentByPlatform: { twitter: CAPTION, linkedin: CAPTION },
});

const RESPONSES_PAYLOAD = {
  output: [{ type: "message", content: [{ type: "output_text", text: DRAFT_JSON }] }],
};

describe("draftHumanPostContent writing models", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("writes with the DeepSeek chat protocol first", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([DEEPSEEK, OPENAI]);
    vi.mocked(callChatCompletions).mockResolvedValue({ text: DRAFT_JSON });

    const drafts = await draftHumanPostContent(STORY, ["twitter", "linkedin"]);

    expect(callChatCompletions).toHaveBeenCalledTimes(1);
    expect(vi.mocked(callChatCompletions).mock.calls[0][0]).toMatchObject({
      model: "deepseek-flash",
      baseUrl: "https://api.deepseek.com",
      jsonMode: true,
    });
    expect(callOpenAIResponses).not.toHaveBeenCalled();
    expect(drafts.source).toBe("llm");
    expect(drafts.provider).toBe("deepseek");
    expect(drafts.model).toBe("deepseek-flash");
    expect(drafts.contentByPlatform.twitter).toBe(CAPTION);
    expect(drafts.contentByPlatform.linkedin).toBe(CAPTION);
  });

  it("falls back to OpenAI when the primary provider fails", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([DEEPSEEK, OPENAI]);
    vi.mocked(callChatCompletions).mockRejectedValue(
      new Error("Chat completions API error: 429 insufficient_quota")
    );
    vi.mocked(callOpenAIResponses).mockResolvedValue({
      data: RESPONSES_PAYLOAD,
      trace: null,
    } as never);

    const drafts = await draftHumanPostContent(STORY, ["twitter", "linkedin"]);

    expect(callChatCompletions).toHaveBeenCalledTimes(1);
    expect(callOpenAIResponses).toHaveBeenCalledTimes(1);
    expect(drafts.source).toBe("llm");
    expect(drafts.provider).toBe("openai");
    expect(drafts.contentByPlatform.twitter).toBe(CAPTION);
  });

  it("reports every provider failure instead of blaming nobody", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([DEEPSEEK, OPENAI]);
    vi.mocked(callChatCompletions).mockRejectedValue(new Error("429 no credits"));
    vi.mocked(callOpenAIResponses).mockRejectedValue(new Error("429 insufficient_quota"));

    const drafts = await draftHumanPostContent(STORY, ["twitter", "linkedin"]);

    expect(drafts.source).toBe("fallback");
    expect(drafts.provider).toBeUndefined();
    expect(drafts.error).toContain("deepseek/deepseek-flash");
    expect(drafts.error).toContain("openai/gpt-4.1-mini");
    expect(drafts.contentByPlatform.twitter).toMatch(/^HN: /);
  });

  it("says so when no writing credential exists at all", async () => {
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([]);

    const drafts = await draftHumanPostContent(STORY, ["twitter", "linkedin"]);

    expect(drafts.source).toBe("fallback");
    expect(drafts.error).toBe("No writing model credentials available");
    expect(callChatCompletions).not.toHaveBeenCalled();
    expect(callOpenAIResponses).not.toHaveBeenCalled();
  });
});
