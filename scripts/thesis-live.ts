import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * One live run of the thesis stage against a real story and the real writing model.
 * Not part of CI: run with `npx vitest run --config vitest.live.config.ts`.
 */

const story = {
  title: "Mistral releases the weights of Mistral Large 4 (Le Chonk)",
  summary:
    "Mistral released the weights of its 1-trillion-parameter multimodal flagship, claiming the best open-weight model for coding and defensive cybersecurity, with three reasoning modes and a large price cut against the preview.",
  link: "https://mistral.ai/news/mistral-large-4-oss/",
  sourceName: "Mistral",
  sourceHost: "mistral.ai",
  summaryWasGarbage: false,
};

const extraSources = [
  {
    title: "HN discussion: We're releasing the weights of Mistral Large 4",
    url: "https://news.ycombinator.com/item?id=50289418",
    text:
      "They slashed pricing, it's now nearly half vs the preview (Input: $0.7/M tokens, Output: $2.1/M tokens vs Input: $1.36/M tokens, Output: $4.18/M tokens). At the original pricing in my evals, Mistral Large 4 Preview was not competitive. With this price point and some improvements on top, this full release warrants a major reassessment.",
  },
  {
    title: "Artificial Analysis v5 and the benchmarker's dilemma",
    url: "https://www.interconnects.ai/p/artificial-analysis-v5-and-the-benchmarkers",
    text:
      "Hill-climbing is easy, knowing what to hill-climb is hard. Making scores go up is expensive, but we have a much clearer playbook for it than we do for creating meaningful benchmarks at the true frontier of AI today.",
  },
];

describe("thesis live run", () => {
  it("decides on a view and writes the post from it", async () => {
    const { generateThesisForStory, fetchSourceText } = await import("@/lib/pipeline/thesis-generator");
    const { draftHumanPostContent } = await import("@/lib/pipeline/human-post-writer");
    const { buildThesisPrompt } = await import("@/lib/pipeline/thesis");
    const { callWritingModel } = await import("@/lib/writing-model");
    const { confirmPostAgainstThesis } = await import("@/lib/pipeline/thesis-confirm");

    const sourceText = await fetchSourceText(story.link);
    const raw = await callWritingModel({
      name: "thesis-live-debug",
      prompt: buildThesisPrompt({
        now: "2026-10-30",
        title: story.title,
        summary: story.summary,
        sourceName: story.sourceName,
        sourceText,
        extraSources,
      }),
      json: true,
      fallbackModel: "deepseek-chat",
      slot: "writing",
    });
    console.log("=== RAW TEXT ===");
    console.log(raw.text.slice(0, 1800));
    console.log("=== RAW DATA KEYS ===", Object.keys(raw.data || {}));

    const decision = await generateThesisForStory(story, { extraSources });
    console.log("=== DECISION ===");
    console.log(JSON.stringify(decision, null, 2));

    expect(decision.action).toBe("post");
    if (decision.action !== "post") return;

    const drafts = await draftHumanPostContent(story, ["twitter"], { thesis: decision.thesis });
    console.log("=== POST ===");
    console.log(drafts.contentByPlatform.twitter);
    console.log("=== CONFIRM ===");
    console.log(JSON.stringify(confirmPostAgainstThesis(drafts.contentByPlatform.twitter, decision.thesis), null, 2));
    console.log("=== META ===");
    console.log(JSON.stringify(drafts, null, 2));
  }, 240000);
});
