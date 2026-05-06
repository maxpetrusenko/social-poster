import { expect, test } from "vitest";

import {
  assessPostQuality,
  buildDeterministicPostFallback,
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
});
