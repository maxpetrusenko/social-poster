import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/model-runtime", () => ({ resolveWritingRuntimes: vi.fn() }));
vi.mock("@/lib/writing-model", () => ({ callWritingModel: vi.fn() }));
vi.mock("@/lib/chat-completions", () => ({ callChatCompletions: vi.fn() }));
vi.mock("./cli-providers.ts", () => ({
  CLI_PROVIDER_TIMEOUT_MS: 90_000,
  runClaudeCli: vi.fn(),
  runCodexCli: vi.fn(),
}));
vi.mock("@/lib/replies/cli-providers", () => ({
  CLI_PROVIDER_TIMEOUT_MS: 90_000,
  runClaudeCli: vi.fn(),
  runCodexCli: vi.fn(),
}));

import { callChatCompletions } from "@/lib/chat-completions";
import { resolveWritingRuntimes, type WritingRuntime } from "@/lib/model-runtime";
import { runClaudeCli, runCodexCli } from "@/lib/replies/cli-providers";
import { callWritingModel } from "@/lib/writing-model";
import { generateAiReplyDraftsWithProvider } from "./ai.ts";

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
  model: "gpt-5-mini",
  source: "env",
};
const CANDIDATE = {
  tweetId: "1",
  author: "a",
  text: "hello world",
  tags: [],
  direction: "dev" as never,
  likes: 0,
  views: "0",
};
const GOOD = JSON.stringify({
  replies: [{ tweetId: "1", drafts: ["what breaks first when the runtime restarts mid task"] }],
});
const dsResult = (text: string) => ({
  data: { output: [{ type: "message", content: [{ type: "output_text", text }] }] },
  text,
  runtime: DEEPSEEK,
  trace: null,
});

describe("reply draft provider chain", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    delete process.env.XAI_API_KEY;
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([DEEPSEEK, OPENAI]);
  });
  afterEach(() => vi.resetAllMocks());

  it("uses claude first and stops there", async () => {
    vi.mocked(runClaudeCli).mockResolvedValue(GOOD);
    const out = await generateAiReplyDraftsWithProvider([CANDIDATE]);
    expect(out.provider).toBe("claude-cli");
    expect(out.drafts.get("1")).toHaveLength(1);
    expect(runCodexCli).not.toHaveBeenCalled();
    expect(callWritingModel).not.toHaveBeenCalled();
  });

  it("skips a missing claude binary, then a timed-out codex, and lands on DeepSeek only", async () => {
    vi.mocked(runClaudeCli).mockRejectedValue(new Error("claude binary not found"));
    vi.mocked(runCodexCli).mockRejectedValue(new Error("codex timed out after 90000ms"));
    vi.mocked(callWritingModel).mockResolvedValue(dsResult(GOOD));
    const out = await generateAiReplyDraftsWithProvider([CANDIDATE]);
    expect(out.provider).toBe("deepseek");
    expect(callChatCompletions).not.toHaveBeenCalled();
    const call = vi.mocked(callWritingModel).mock.calls[0][0];
    expect(call.slot).toBe("reply");
    expect(call.runtimes).toEqual([DEEPSEEK]);
  });

  it("skips grok silently when XAI_API_KEY is unset and uses it when set", async () => {
    vi.mocked(runClaudeCli).mockRejectedValue(new Error("x"));
    vi.mocked(runCodexCli).mockRejectedValue(new Error("x"));
    vi.mocked(callWritingModel).mockResolvedValue(dsResult(GOOD));
    await generateAiReplyDraftsWithProvider([CANDIDATE]);
    expect(callChatCompletions).not.toHaveBeenCalled();

    process.env.XAI_API_KEY = "xai";
    vi.mocked(callChatCompletions).mockResolvedValue({ text: GOOD } as never);
    const out = await generateAiReplyDraftsWithProvider([CANDIDATE]);
    expect(out.provider).toBe("xai-grok");
    delete process.env.XAI_API_KEY;
  });

  it("falls through on unparseable CLI output", async () => {
    vi.mocked(runClaudeCli).mockResolvedValue("not json");
    vi.mocked(runCodexCli).mockResolvedValue(GOOD);
    const out = await generateAiReplyDraftsWithProvider([CANDIDATE]);
    expect(out.provider).toBe("codex-cli");
  });

  it("throws a clear error and never calls the model without a DeepSeek runtime", async () => {
    vi.mocked(runClaudeCli).mockRejectedValue(new Error("x"));
    vi.mocked(runCodexCli).mockRejectedValue(new Error("x"));
    vi.mocked(resolveWritingRuntimes).mockResolvedValue([OPENAI]);
    await expect(generateAiReplyDraftsWithProvider([CANDIDATE])).rejects.toThrow(
      "Reply drafts require DEEPSEEK_API_KEY"
    );
    expect(callWritingModel).not.toHaveBeenCalled();
  });
});
