import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveDynamicSchedulePreview } from "./calendar-schedule-preview.ts";

test("resolveDynamicSchedulePreview uses image-backed candidates for image schedules", () => {
  const preview = resolveDynamicSchedulePreview(
    { jobType: "image_post" },
    [
      {
        title: "No image",
        link: "https://example.com/a",
        summary: "A",
        score: 1,
        ogImageUrl: null,
        previewImageUrl: null,
        sourceHost: "example.com",
      },
      {
        title: "Has image",
        link: "https://example.com/b",
        summary: "B",
        score: 2,
        ogImageUrl: "https://cdn.example.com/card.jpg",
        previewImageUrl: "/api/og-image?url=https%3A%2F%2Fcdn.example.com%2Fcard.jpg",
        sourceHost: "example.com",
      },
    ],
    0
  );

  assert.equal(preview?.label, "Has image");
  assert.equal(
    preview?.mediaUrl,
    "/api/og-image?url=https%3A%2F%2Fcdn.example.com%2Fcard.jpg"
  );
  assert.equal(preview?.contentType, "image");
  assert.equal(preview?.preview, "Has image.");
  assert.equal(preview?.content, "Has image.");
  assert.equal(preview?.contentByPlatform.twitter, "Has image.");
  assert.equal(
    preview?.firstCommentByPlatform.twitter,
    "Source: Has image\nhttps://example.com/b"
  );
  assert.equal(preview?.sourceUrl, "https://example.com/b");
  assert.equal(preview?.sourceHost, "example.com");
  assert.equal(preview?.forecast, true);
});

test("resolveDynamicSchedulePreview renders platform post bodies instead of raw garbage summaries", () => {
  const preview = resolveDynamicSchedulePreview(
    { jobType: "image_post" },
    [
      {
        title: "€54k spike in 13h from unrestricted Firebase browser key accessing Gemini APIs",
        link: "https://discuss.ai.google.dev/t/example",
        summary: "Comments",
        score: 10,
        ogImageUrl: "https://cdn.example.com/card.jpg",
        previewImageUrl: "/api/og-image?url=https%3A%2F%2Fcdn.example.com%2Fcard.jpg",
        sourceHost: "discuss.ai.google.dev",
      },
    ],
    0,
    ["x", "linkedin"]
  );

  assert.equal(
    preview?.contentByPlatform.twitter,
    "€54k spike in 13h from unrestricted Firebase browser key accessing Gemini APIs."
  );
  assert.equal(
    preview?.firstCommentByPlatform.twitter,
    "Source: €54k spike in 13h from unrestricted Firebase browser key accessing Gemini APIs\nhttps://discuss.ai.google.dev/t/example"
  );
  assert.doesNotMatch(preview?.contentByPlatform.twitter ?? "", /^Comments$/i);
  assert.match(
    preview?.contentByPlatform.linkedin ?? "",
    /Source: https:\/\/discuss\.ai\.google\.dev\/t\/example/
  );
});
