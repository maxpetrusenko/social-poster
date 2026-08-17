import assert from "node:assert/strict";
import { test } from "vitest";

import { selectFeedStoryForSchedule } from "./feed-story-selection.ts";

test("selectFeedStoryForSchedule prefers the first story when image is optional", () => {
  const story = selectFeedStoryForSchedule(
    [
      { title: "A", summary: "A", link: "https://a.test", score: 10 },
      { title: "B", summary: "B", link: "https://b.test", score: 9, imageUrl: "https://b.test/og.png" },
    ],
    { requireImage: false }
  );

  assert.equal(story?.title, "A");
});

test("selectFeedStoryForSchedule skips imageless stories for image posts", () => {
  const story = selectFeedStoryForSchedule(
    [
      { title: "A", summary: "A", link: "https://a.test", score: 10 },
      { title: "B", summary: "B", link: "https://b.test", score: 9, imageUrl: "https://b.test/og.png" },
    ],
    { requireImage: true }
  );

  assert.equal(story?.title, "B");
  assert.equal(story?.imageUrl, "https://b.test/og.png");
});

test("selectFeedStoryForSchedule returns null when image is required but unavailable", () => {
  const story = selectFeedStoryForSchedule(
    [{ title: "A", summary: "A", link: "https://a.test", score: 10 }],
    { requireImage: true }
  );

  assert.equal(story, null);
});

test("selectFeedStoryForSchedule with aiTopicGate skips non-AI stories even when ranked first", () => {
  const story = selectFeedStoryForSchedule(
    [
      { title: "Super El Niño Keeps Growing", summary: "Record westerly wind anomalies.", link: "https://weather.test", score: 100, imageUrl: "https://weather.test/og.png" },
      { title: "Claude: System Prompts", summary: "Claude's apps use periodically updated system prompts.", link: "https://claude.test", score: 80, imageUrl: "https://claude.test/og.png" },
    ],
    { requireImage: true, aiTopicGate: true }
  );

  assert.equal(story?.title, "Claude: System Prompts");
});

test("selectFeedStoryForSchedule with aiTopicGate returns null when only non-AI stories exist", () => {
  const story = selectFeedStoryForSchedule(
    [{ title: "The weekend is 100 years old", summary: "Henry Ford gave workers weekends.", link: "https://guardian.test", score: 100, imageUrl: "https://guardian.test/og.png" }],
    { requireImage: true, aiTopicGate: true }
  );

  assert.equal(story, null);
});

test("selectFeedStoryForSchedule with aiTopicGate still honors requireImage", () => {
  const story = selectFeedStoryForSchedule(
    [
      { title: "Gemini 3.7 Flash", summary: "Improves coding accuracy.", link: "https://gemini.test", score: 90 },
      { title: "GPT-5.6 Sol", summary: "Delivers 750 tokens/sec.", link: "https://cerebras.test", score: 85, imageUrl: "https://cerebras.test/og.png" },
    ],
    { requireImage: true, aiTopicGate: true }
  );

  assert.equal(story?.title, "GPT-5.6 Sol");
});

test("selectFeedStoryForSchedule without aiTopicGate keeps legacy behavior", () => {
  const story = selectFeedStoryForSchedule(
    [
      { title: "Super El Niño Keeps Growing", summary: "Record westerly wind anomalies.", link: "https://weather.test", score: 100, imageUrl: "https://weather.test/og.png" },
      { title: "Claude: System Prompts", summary: "Claude's apps use periodically updated system prompts.", link: "https://claude.test", score: 80, imageUrl: "https://claude.test/og.png" },
    ],
    { requireImage: true }
  );

  assert.equal(story?.title, "Super El Niño Keeps Growing");
});
