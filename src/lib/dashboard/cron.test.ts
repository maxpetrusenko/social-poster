import assert from "node:assert/strict";
import { test } from "vitest";

import { getCronOccurrences } from "./cron.ts";

test("getCronOccurrences treats recurring schedule cron as UTC", () => {
  const occurrences = getCronOccurrences(
    "0 19 * * *",
    new Date("2026-04-14T00:00:00.000Z"),
    new Date("2026-04-14T23:59:59.999Z"),
    5
  );

  assert.equal(occurrences.length, 1);
  assert.equal(occurrences[0]?.toISOString(), "2026-04-14T19:00:00.000Z");
});
