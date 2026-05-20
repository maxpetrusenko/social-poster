import assert from "node:assert/strict";
import test from "node:test";

import {
  getDrawerPlatformForConnectionFilter,
  platformMatchesConnectionFilter,
} from "./connections-page-utils.ts";

test("LinkedIn filter includes native profile and page variants", () => {
  assert.equal(platformMatchesConnectionFilter("linkedin", "linkedin"), true);
  assert.equal(
    platformMatchesConnectionFilter("linkedin_personal", "linkedin"),
    true
  );
  assert.equal(
    platformMatchesConnectionFilter("linkedin_company", "linkedin"),
    true
  );
  assert.equal(platformMatchesConnectionFilter("twitter", "linkedin"), false);
});

test("LinkedIn native add starts with the profile OAuth option", () => {
  assert.equal(
    getDrawerPlatformForConnectionFilter("linkedin", "native"),
    "linkedin_personal"
  );
  assert.equal(
    getDrawerPlatformForConnectionFilter("linkedin", "proxy"),
    "linkedin"
  );
});

test("Instagram filter includes personal legacy connections and opens Instagram methods", () => {
  assert.equal(platformMatchesConnectionFilter("instagram", "instagram"), true);
  assert.equal(
    platformMatchesConnectionFilter("instagram_personal", "instagram"),
    true
  );
  assert.equal(platformMatchesConnectionFilter("facebook", "instagram"), false);
  assert.equal(
    getDrawerPlatformForConnectionFilter("instagram", "native"),
    "instagram"
  );
  assert.equal(
    getDrawerPlatformForConnectionFilter("instagram", "proxy"),
    "instagram"
  );
});
