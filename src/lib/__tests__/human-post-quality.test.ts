import { expect, test } from "vitest";

import {
  assessPostQuality,
  buildDeterministicPostFallback,
  cleanHumanPostDraft,
  sanitizeHumanPostStory,
} from "../pipeline/human-post-quality.ts";

const redditStory = {
  title: "Multi-token prediction is moving from paper trick to serving knob",
  summary: "submitted by /u/example [link] [comments]",
  link: "https://example.com/multi-token",
  sourceName: "r/LocalLLaMA",
};

test("sanitizeHumanPostStory drops reddit metadata summaries", () => {
  const sanitized = sanitizeHumanPostStory(redditStory);

  expect(sanitized.summary).toBe("");
  expect(sanitized.summaryWasGarbage).toBe(true);
});

test("assessPostQuality rejects title regurgitation and rss metadata", () => {
  const quality = assessPostQuality(
    `${redditStory.title}. submitted by /u/example [link] [comments]`,
    redditStory,
    "x"
  );

  expect(quality.ok).toBe(false);
  expect(quality.reasons).toContain("reddit_metadata");
  expect(quality.reasons).toContain("rss_link_comments_metadata");
  expect(quality.reasons).toContain("title_regurgitation");
});

test("assessPostQuality rejects hype, hashtags, emoji, and empty generic filler", () => {
  const quality = assessPostQuality(
    "BREAKING: This highlights the growing importance of AI agents. #AI 🚀",
    redditStory,
    "x"
  );

  expect(quality.ok).toBe(false);
  expect(quality.reasons).toContain("breaking");
  expect(quality.reasons).toContain("hashtag");
  expect(quality.reasons).toContain("emoji");
  expect(quality.reasons).toContain("generic_filler");
});

test("assessPostQuality rejects named no-ai-slop patterns", () => {
  const story = {
    title: "Agent evaluations need independent review",
    summary: "A separate evaluator catches errors missed by the generating model.",
  };

  expect(
    assessPostQuality(
      "This is not about the model. It is about the eval.",
      story,
      "linkedin"
    ).reasons
  ).toContain("no_ai_slop:binary_contrast");
  expect(
    assessPostQuality(
      "Here is the thing: a separate evaluator catches unsupported claims.",
      story,
      "linkedin"
    ).reasons
  ).toContain("no_ai_slop:throat_clearing");
  expect(
    assessPostQuality(
      "The launch marks a pivotal moment for agent evaluation.",
      story,
      "linkedin"
    ).reasons
  ).toContain("no_ai_slop:importance_puffery");
  expect(
    assessPostQuality(
      "A reviewer checks the evidence. It records failures. Teams repair them.",
      story,
      "linkedin"
    ).reasons
  ).toContain("no_ai_slop:stacked_short_sentences");
});

test("cleanHumanPostDraft strips source and credit footer lines", () => {
  const cleaned = cleanHumanPostDraft(
    [
      "AI tools are becoming workflow routers.",
      "",
      "The useful part is the handoff boundary.",
      "",
      "via @tom_doerr",
      "Source: https://example.com/story",
    ].join("\n"),
    "x"
  );

  expect(cleaned).toBe(
    [
      "AI tools are becoming workflow routers.",
      "",
      "The useful part is the handoff boundary.",
    ].join("\n")
  );
  expect(
    assessPostQuality("Useful post.\n\nvia @tom_doerr", redditStory, "x").reasons
  ).toContain("source_credit_label");
});

test("buildDeterministicPostFallback produces a usable title-only post", () => {
  const content = buildDeterministicPostFallback(
    {
      title: "OpenAI adds a new low-latency serving option for agent workloads",
      summary: "",
      sourceName: "OpenAI",
      link: "https://openai.com/example",
    },
    "x"
  );
  const quality = assessPostQuality(
    content,
    {
      title: "OpenAI adds a new low-latency serving option for agent workloads",
      summary: "",
      sourceName: "OpenAI",
    },
    "x"
  );

  expect(quality.ok).toBe(true);
  expect(content.length).toBeLessThanOrEqual(275);
  expect(content).not.toMatch(/submitted by|\[link\]|\[comments\]|#/i);
  expect(content).not.toMatch(
    /builder takeaway|what stands out|interesting part|gives one concrete signal|narrow signal/i
  );
});
