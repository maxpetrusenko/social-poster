import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/model-providers", () => ({ resolveWorkspaceModelConfig: vi.fn(async () => null) }));

import { resolveWorkspaceModelConfig } from "@/lib/model-providers";
import { resolveWritingRuntimes } from "@/lib/model-runtime";

const ORIGINAL_ENV = { ...process.env };

describe("resolveWritingRuntimes", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.mocked(resolveWorkspaceModelConfig).mockResolvedValue(null);
  });

  it("orders DeepSeek first and OpenAI second", async () => {
    process.env.DEEPSEEK_API_KEY = "deepseek-test";
    process.env.OPENAI_API_KEY = "openai-test";

    const runtimes = await resolveWritingRuntimes({
      workspaceId: null,
      fallbackModel: "gpt-4.1-mini",
    });

    expect(runtimes.map((runtime) => `${runtime.provider}:${runtime.protocol}`)).toEqual([
      "deepseek:openai_chat",
      "openai:openai_responses",
    ]);
    expect(runtimes[0].model).toBe("deepseek-flash");
    expect(runtimes[0].baseUrl).toBe("https://api.deepseek.com");
    expect(runtimes[1].model).toBe("gpt-4.1-mini");
  });

  it("honours a DeepSeek model override", async () => {
    process.env.DEEPSEEK_API_KEY = "deepseek-test";
    process.env.DEEPSEEK_SOCIAL_POST_MODEL = "deepseek-v4-pro";

    const runtimes = await resolveWritingRuntimes({
      workspaceId: null,
      fallbackModel: "gpt-4.1-mini",
    });

    expect(runtimes[0].model).toBe("deepseek-v4-pro");
  });

  it("returns nothing when no provider has a credential", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;

    expect(
      await resolveWritingRuntimes({ workspaceId: null, fallbackModel: "gpt-4.1-mini" })
    ).toEqual([]);
  });

  it("prefers a workspace OpenAI credential over the env key", async () => {
    process.env.DEEPSEEK_API_KEY = "deepseek-test";
    process.env.OPENAI_API_KEY = "openai-test";
    vi.mocked(resolveWorkspaceModelConfig).mockResolvedValue({
      provider: "openai",
      protocol: "openai_responses",
      apiKey: "workspace-key",
      model: "gpt-5",
      baseUrl: "https://api.openai.com/v1",
    });

    const runtimes = await resolveWritingRuntimes({
      workspaceId: "workspace-1",
      fallbackModel: "gpt-4.1-mini",
    });

    const openai = runtimes.find((runtime) => runtime.provider === "openai");
    expect(openai?.model).toBe("gpt-5");
    expect(openai?.source).toBe("workspace");
  });
});
