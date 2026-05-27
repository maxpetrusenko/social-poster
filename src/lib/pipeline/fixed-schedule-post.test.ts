import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveFixedScheduleContent } from "./fixed-schedule-post.ts";

test("resolveFixedScheduleContent rotates shared variants by prior runs", () => {
  const content = resolveFixedScheduleContent(
    {
      postMode: "fixed",
      title: "Referral",
      contentVariants: ["v1", "v2", "v3"],
    },
    ["twitter", "linkedin"],
    4
  );

  assert.ok(content);
  assert.equal(content?.contentByPlatform.twitter, "v2");
  assert.equal(content?.contentByPlatform.linkedin, "v2");
});

test("resolveFixedScheduleContent can pin rotation to calendar weeks", () => {
  const content = resolveFixedScheduleContent(
    {
      postMode: "fixed",
      title: "Referral",
      rotationMode: "calendar_week",
      rotationAnchorDate: "2026-04-16T14:30:00-04:00",
      contentVariants: ["week1", "week2", "week3", "week4"],
      mediaUrlVariantsByPlatform: {
        instagram: [
          "/campaigns/referral/story-01.png",
          "/campaigns/referral/story-02.png",
          "/campaigns/referral/story-03.png",
          "/campaigns/referral/story-04.png",
        ],
      },
    },
    ["twitter", "instagram"],
    99,
    new Date("2026-05-07T14:30:00-04:00")
  );

  assert.ok(content);
  assert.equal(content?.variantIndex, 3);
  assert.equal(content?.contentByPlatform.twitter, "week4");
  assert.equal(
    content?.mediaUrlByPlatform.instagram,
    "https://social.maxpetrusenko.com/campaigns/referral/story-04.png"
  );
});

test("resolveFixedScheduleContent clamps calendar rotation before anchor", () => {
  const content = resolveFixedScheduleContent(
    {
      postMode: "fixed",
      title: "Referral",
      rotationMode: "calendar_week",
      rotationAnchorDate: "2026-04-16T14:30:00-04:00",
      contentVariants: ["week1", "week2", "week3", "week4"],
    },
    ["twitter"],
    999,
    new Date("2026-04-13T18:58:00-04:00")
  );

  assert.ok(content);
  assert.equal(content?.variantIndex, 0);
  assert.equal(content?.contentByPlatform.twitter, "week1");
});

test("resolveFixedScheduleContent supports platform specific variants", () => {
  const content = resolveFixedScheduleContent(
    {
      postMode: "fixed",
      title: "Referral",
      contentVariantsByPlatform: {
        twitter: ["x1", "x2"],
        linkedin: ["li1", "li2", "li3"],
      },
      mediaUrl: "https://example.com/card.jpg",
      instagramContentType: "story",
    },
    ["twitter", "linkedin", "instagram"],
    2
  );

  assert.ok(content);
  assert.equal(content?.contentByPlatform.twitter, "x1");
  assert.equal(content?.contentByPlatform.linkedin, "li3");
  assert.equal(content?.contentByPlatform.instagram, "Referral");
  assert.equal(
    content?.mediaUrlByPlatform.twitter,
    "https://example.com/card.jpg"
  );
  assert.equal(
    content?.mediaUrlByPlatform.instagram,
    "https://example.com/card.jpg"
  );
  assert.equal(content?.instagramContentTypeByPlatform.instagram, "story");
});

test("resolveFixedScheduleContent supports per-platform media", () => {
  const content = resolveFixedScheduleContent(
    {
      postMode: "fixed",
      title: "Referral",
      mediaUrl: "https://example.com/shared-card.jpg",
      mediaUrlByPlatform: {
        twitter: "https://example.com/x-card.jpg",
        x: "https://example.com/x-card-alias.jpg",
        linkedin: "https://example.com/linkedin-card.jpg",
        instagram: "https://example.com/ig-story.png",
      },
      instagramContentTypeByPlatform: {
        instagram: "story",
      },
    },
    ["twitter", "linkedin", "instagram"],
    1
  );

  assert.ok(content);
  assert.equal(
    content?.mediaUrlByPlatform.twitter,
    "https://example.com/x-card.jpg"
  );
  assert.equal(
    content?.mediaUrlByPlatform.linkedin,
    "https://example.com/linkedin-card.jpg"
  );
  assert.equal(
    content?.mediaUrlByPlatform.instagram,
    "https://example.com/ig-story.png"
  );
  assert.equal(content?.instagramContentTypeByPlatform.instagram, "story");
});

test("resolveFixedScheduleContent rotates media variants and resolves app-relative urls", () => {
  const previousAppUrl = process.env.APP_URL;
  process.env.APP_URL = "https://social.maxpetrusenko.com";

  try {
    const content = resolveFixedScheduleContent(
      {
        postMode: "fixed",
        title: "Referral",
        mediaUrlVariantsByPlatform: {
          instagram: [
            "/campaigns/referral/story-01.png",
            "/campaigns/referral/story-02.png",
          ],
        },
        mediaUrlByPlatform: {
          twitter: "/api/og-image?url=https%3A%2F%2Fexample.com%2Fog.jpg",
        },
      },
      ["twitter", "instagram"],
      1
    );

    assert.ok(content);
    assert.equal(
      content?.mediaUrlByPlatform.instagram,
      "https://social.maxpetrusenko.com/campaigns/referral/story-02.png"
    );
    assert.equal(
      content?.mediaUrlByPlatform.twitter,
      "https://social.maxpetrusenko.com/api/og-image?url=https%3A%2F%2Fexample.com%2Fog.jpg"
    );
  } finally {
    if (previousAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = previousAppUrl;
    }
  }
});
