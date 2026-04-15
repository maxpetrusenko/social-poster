import assert from "node:assert/strict";
import test from "node:test";

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
  assert.equal(preview?.preview, "B");
  assert.equal(preview?.content, "B");
  assert.equal(preview?.sourceUrl, "https://example.com/b");
  assert.equal(preview?.sourceHost, "example.com");
  assert.equal(preview?.forecast, true);
});
