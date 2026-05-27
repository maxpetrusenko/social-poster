import assert from "node:assert/strict";
import { test } from "vitest";

import { deriveCalendarRunDetails } from "./calendar-run-details.ts";

test("deriveCalendarRunDetails prefers stored captions and feed image for new runs", () => {
  const details = deriveCalendarRunDetails(
    {
      steps: [
        {
          name: "feed:pull",
          status: "completed",
          output: {
            title: "ClawRun",
            summary: "Agent infra",
            imageUrl: "https://cdn.example.com/story.png",
          },
        },
        {
          name: "caption:write",
          status: "completed",
          output: {
            captions: [
              {
                platform: "twitter",
                content: "short x take",
                chars: 12,
                mediaUrl: "https://cdn.example.com/story.png",
                mediaType: "image",
              },
              {
                platform: "linkedin",
                content: "longer linkedin take",
                chars: 20,
                mediaUrl: "https://cdn.example.com/story.png",
                mediaType: "image",
              },
            ],
          },
        },
      ],
    },
    [{ type: "x" }, { type: "linkedin" }]
  );

  assert.equal(details.title, "ClawRun");
  assert.equal(details.content, "short x take");
  assert.equal(details.mediaUrl, "https://cdn.example.com/story.png");
  assert.equal(details.contentType, "image");
  assert.equal(details.sourceUrl, null);
  assert.equal(details.platforms[0]?.type, "x");
  assert.equal(details.platforms[0]?.content, "short x take");
});

test("deriveCalendarRunDetails falls back to publish raw payload for legacy runs", () => {
  const details = deriveCalendarRunDetails(
    {
      steps: [
        {
          name: "publish",
          status: "completed",
          output: {
            outcomes: [
              {
                platform: "twitter",
                success: true,
                raw: {
                  threadParts: 1,
                },
              },
              {
                platform: "linkedin",
                success: true,
                raw: {
                  post: {
                    content: "published linkedin body",
                    mediaItems: [
                      {
                        type: "image",
                        url: "https://cdn.example.com/published.png",
                      },
                    ],
                  },
                },
              },
            ],
          },
        },
      ],
    },
    [{ type: "x" }, { type: "linkedin" }]
  );

  assert.equal(details.content, "published linkedin body");
  assert.equal(details.mediaUrl, "https://cdn.example.com/published.png");
  assert.equal(details.contentType, "image");
  assert.equal(details.sourceUrl, null);
  assert.equal(details.platforms[1]?.type, "linkedin");
  assert.equal(details.platforms[1]?.content, "published linkedin body");
});
