import { beforeEach, describe, expect, it, vi } from "vitest";

const { callWritingModel } = vi.hoisted(() => ({ callWritingModel: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/writing-model", () => ({ callWritingModel }));

import { generateThesisForStory, stripHtmlToText } from "@/lib/pipeline/thesis-generator";

const validThesisJson = {
  action: "post",
  claim:
    "Carbon leads the general index but still loses to Opus on the coding agent index, so agent builders should ignore the headline number.",
  stakes:
    "Anyone picking a model for agent work pays twice for a benchmark win that never shows up in tool use.",
  falsifier: "Carbon taking the top spot on the coding agent index.",
  confidence: "medium",
  evidence: [
    {
      kind: "primary",
      url: "https://deepmind.google/blog/gemini-4-carbon",
      title: "Gemini 4 Carbon",
      quote: "Carbon scores 59 on the Artificial Analysis intelligence index.",
    },
    {
      kind: "quant",
      url: "https://artificialanalysis.ai/models",
      title: "Leaderboard",
      quote: "Coding agent index: Opus 5.5 at 62, Carbon at 59.",
    },
  ],
};

beforeEach(() => {
  callWritingModel.mockReset();
});

describe("generateThesisForStory", () => {
  it("skips a story with no title", async () => {
    const result = await generateThesisForStory({ title: "  " });
    expect(result).toEqual({ action: "skip", reason: "story has no title" });
    expect(callWritingModel).not.toHaveBeenCalled();
  });

  it("skips when there is no source text and the summary is a stub", async () => {
    const result = await generateThesisForStory(
      {
        title: "Something happened",
        summary: "Read more.",
        link: "https://example.com/a",
      },
      { fetchText: async () => "" }
    );
    expect(result.action).toBe("skip");
    expect(callWritingModel).not.toHaveBeenCalled();
  });

  it("returns a validated thesis from the model", async () => {
    callWritingModel.mockResolvedValue({ data: validThesisJson, text: "", runtime: {} });
    const result = await generateThesisForStory(
      {
        title: "Gemini 4 Carbon launches",
        summary: "Google ships a new model.",
        link: "https://deepmind.google/blog/gemini-4-carbon",
      },
      { fetchText: async () => "Carbon scores 59 on the index. Opus 5.5 scores 62 on coding agents." }
    );

    expect(result.action).toBe("post");
    if (result.action !== "post") throw new Error("expected post");
    expect(result.thesis.evidence).toHaveLength(2);
    expect(result.thesis.confidence).toBe("medium");
  });

  it("skips when the model restates the headline instead of holding a view", async () => {
    callWritingModel.mockResolvedValue({
      data: { ...validThesisJson, claim: "Gemini 4 Carbon launches in the Gemini app today" },
      text: "",
      runtime: {},
    });
    const result = await generateThesisForStory(
      {
        title: "Gemini 4 Carbon launches in the Gemini app today",
        summary: "Google ships a new model.",
        link: "https://deepmind.google/blog/gemini-4-carbon",
      },
      { fetchText: async () => "Carbon scores 59 on the index." }
    );

    expect(result.action).toBe("skip");
    if (result.action !== "skip") throw new Error("expected skip");
    expect(result.reason).toContain("thesis failed validation");
    expect(result.reason).toContain("claim restates the headline");
  });

  it("passes the skip decision through without inventing a fallback view", async () => {
    callWritingModel.mockResolvedValue({
      data: { action: "skip", reason: "press release with no consequence" },
      text: "",
      runtime: {},
    });
    const result = await generateThesisForStory(
      {
        title: "Vendor announces partnership",
        summary: "The companies said they will collaborate.",
        link: "https://example.com/pr",
      },
      { fetchText: async () => "The companies said they will collaborate on future products." }
    );
    expect(result).toEqual({ action: "skip", reason: "press release with no consequence" });
  });
});

describe("stripHtmlToText", () => {
  it("drops scripts and keeps readable paragraphs", () => {
    const text = stripHtmlToText(
      "<html><script>alert(1)</script><p>Carbon scores 59.</p><p>Opus scores 62.</p></html>"
    );
    expect(text).not.toContain("alert");
    expect(text).toContain("Carbon scores 59.");
    expect(text).toContain("Opus scores 62.");
  });
});
