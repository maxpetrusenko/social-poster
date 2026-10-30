import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/langsmith", () => ({ callOpenAIResponses: vi.fn() }));
vi.mock("@/lib/model-runtime", () => ({ resolveOpenAIResponsesRuntime: vi.fn() }));

import { buildHumanPostPrompt } from "../pipeline/human-post-writer.ts";
import type { Thesis } from "../pipeline/thesis.ts";

const thesis: Thesis = {
  claim:
    "Carbon leads the general index but still loses to Opus on the coding agent index, so agent builders should ignore the headline number.",
  stakes:
    "Anyone picking a model for agent work pays twice for a benchmark win that never shows up in tool use.",
  falsifier: "Carbon taking the top spot on the coding agent index.",
  confidence: "medium",
  evidence: [
    {
      id: "e1",
      kind: "primary",
      url: "https://deepmind.google/blog/gemini-4-carbon",
      title: "Gemini 4 Carbon",
      quote: "Carbon scores 59 on the Artificial Analysis intelligence index.",
    },
    {
      id: "e2",
      kind: "quant",
      url: "https://artificialanalysis.ai/models",
      title: "Leaderboard",
      quote: "Coding agent index: Opus 5.5 at 62, Carbon at 59.",
    },
  ],
};

const rssSettings = {
  candidateWindowHours: 48,
  candidatePoolSize: 24,
  minimumScore: 0,
  tractionWeight: 35,
  keywordBoostTerms: [],
  xTemplate: "{{title}}",
  linkedinTemplate: "{{title}}",
  transformationPrompt: "",
  imageSelectionMode: "prefer_open_graph" as const,
  imageSelectionNotes: "",
};

const story = {
  title: "Gemini 4 Carbon launches",
  summary: "Google ships a new model with a headline benchmark win.",
  sourceName: "DeepMind",
  sourceHost: "deepmind.google",
  summaryWasGarbage: false,
};

describe("human post writer prompt with a thesis", () => {
  it("stops being neutral when a point of view is supplied", () => {
    const prompt = buildHumanPostPrompt(story, ["twitter"], "Carbon scores 59.", rssSettings, false, thesis);

    expect(prompt).toContain("<thesis-data>");
    expect(prompt).toContain(thesis.claim);
    expect(prompt).toContain(thesis.stakes);
    expect(prompt).toContain("[e2 quant]");
    expect(prompt).toContain("The point of view is supplied below");
    expect(prompt).toContain("End on the claim or the consequence, never on a question");
    expect(prompt).not.toContain("stay neutral. Do not invent Max's opinion");
  });

  it("keeps the old neutral contract when no thesis is supplied", () => {
    const prompt = buildHumanPostPrompt(story, ["twitter"], "Carbon scores 59.", rssSettings, false);

    expect(prompt).toContain("stay neutral. Do not invent Max's opinion");
    expect(prompt).not.toContain("<thesis-data>");
  });

  it("still forbids new facts when a thesis is supplied", () => {
    const prompt = buildHumanPostPrompt(story, ["twitter"], "Carbon scores 59.", rssSettings, true, thesis);

    expect(prompt).toContain("Do not add facts, numbers or quotes that are not in the evidence list");
    expect(prompt).toContain("<untrusted-source-data>");
  });
});
