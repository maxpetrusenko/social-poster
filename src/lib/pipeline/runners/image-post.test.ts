import assert from "node:assert/strict";
import test from "node:test";

import { selectFeedStoryForSchedule } from "./image-post.ts";

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
