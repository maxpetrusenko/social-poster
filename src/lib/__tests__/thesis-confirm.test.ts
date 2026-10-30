import { describe, expect, it } from "vitest";
import { confirmPostAgainstThesis, extractNumberTokens } from "@/lib/pipeline/thesis-confirm";

const thesis = {
  claim: "The price cut, not the open weights, is what changed Mistral Large 4's position.",
  stakes: "Teams running coding agents should re-run evals.",
  falsifier: "Re-evaluations still leave it behind GLM-5.3 on cost per merged change.",
  evidence: [
    {
      kind: "primary",
      id: "e1",
      title: "Mistral releases the weights of Mistral Large 4",
      url: "https://mistral.ai/news/mistral-large-4-oss/",
      quote:
        "Mistral Large 4 scores 48% on the Coding Agent Index, effectively tied with GLM-5.3, using 47% fewer tokens per task.",
    },
    {
      kind: "reaction",
      id: "e2",
      title: "HN discussion",
      url: "https://news.ycombinator.com/item?id=50289418",
      quote: "Input: $0.7/M tokens, Output: $2.1/M tokens vs Input: $1.36/M tokens, Output: $4.18/M tokens.",
    },
  ],
};

describe("extractNumberTokens", () => {
  it("normalises currency and separators", () => {
    expect(extractNumberTokens("at $0.7 and $1,200 and 47%")).toEqual(["0.7", "1200", "47%"]);
  });
});

describe("confirmPostAgainstThesis", () => {
  it("passes when every number is in the evidence", () => {
    const post =
      "mistral large 4 ties glm-5.3 at 48% on the coding agent index with 47% fewer tokens. the cut to $0.7/$2.1 per million is the real release.";
    const result = confirmPostAgainstThesis(post, thesis);
    expect(result.ok).toBe(true);
    expect(result.untraceable).toEqual([]);
    expect(result.checked).toBeGreaterThan(3);
  });

  it("fails on a number the evidence does not contain", () => {
    const post = "mistral large 4 cuts cost by 62% and ties glm-5.3 at 48%.";
    const result = confirmPostAgainstThesis(post, thesis);
    expect(result.ok).toBe(false);
    expect(result.untraceable).toContain("62%");
  });

  it("fails when the post carries a raw link", () => {
    const result = confirmPostAgainstThesis("48% and 47% — https://mistral.ai/news/mistral-large-4-oss/", thesis);
    expect(result.ok).toBe(false);
    expect(result.reasons.join(" ")).toMatch(/raw link/);
  });

  it("fails when the post points at the evidence instead of stating it", () => {
    const result = confirmPostAgainstThesis("mistral large 4 ties glm-5.3 at 48% — see evidence.", thesis);
    expect(result.ok).toBe(false);
  });
});
