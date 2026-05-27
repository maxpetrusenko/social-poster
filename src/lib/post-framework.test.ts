import { test } from "vitest";
import assert from "node:assert/strict";

import { scoreHooks } from "./post-framework.ts";

test("scoreHooks rewards specific, spreadable copy", () => {
  const result = scoreHooks(
    "Most AI programs are mostly branding.\n\nGauntlet AI is more aggressive: Austin, housing, meals, laundry, room cleaning, hard reps building with AI, and a path to a $200k to $1m role.\n\nYou pay $0. CCAT required."
  );

  assert.equal(result.verdict, "strong");
  assert.ok(result.total >= 8);
});

test("scoreHooks penalizes generic promo copy", () => {
  const result = scoreHooks(
    "Excited to share this great opportunity. Apply today for a fantastic program."
  );

  assert.equal(result.verdict, "weak");
});
