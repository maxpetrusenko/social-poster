import assert from "node:assert/strict";
import test from "node:test";

import {
  isDurableScheduleMediaUrl,
  normalizeScheduleMediaSourceUrl,
  probeScheduleMediaUrl,
} from "./schedule-media.ts";

test("normalizeScheduleMediaSourceUrl unwraps og-image wrappers", () => {
  assert.equal(
    normalizeScheduleMediaSourceUrl(
      "/api/og-image?url=https%3A%2F%2Fexample.com%2Fcard.png"
    ),
    "https://example.com/card.png"
  );

  assert.equal(
    normalizeScheduleMediaSourceUrl(
      "https://social.maxpetrusenko.com/api/og-image?url=https%3A%2F%2Fexample.com%2Fcard.png"
    ),
    "https://example.com/card.png"
  );
});

test("isDurableScheduleMediaUrl recognizes schedule media routes", () => {
  assert.equal(
    isDurableScheduleMediaUrl(
      "https://social.maxpetrusenko.com/api/schedule-media/example.png"
    ),
    true
  );
  assert.equal(isDurableScheduleMediaUrl("/api/schedule-media/example.png"), true);
  assert.equal(
    isDurableScheduleMediaUrl("https://social.maxpetrusenko.com/campaigns/referral/story-01.png"),
    false
  );
});

test("probeScheduleMediaUrl accepts local app-hosted campaign assets", async () => {
  const result = await probeScheduleMediaUrl("/campaigns/referral/story-01.png");
  assert.equal(result.ok, true);
  assert.equal(result.sourceUrl, "/campaigns/referral/story-01.png");
});
