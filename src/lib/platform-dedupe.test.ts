import assert from "node:assert/strict";
import { test } from "vitest";

import {
  dedupePlatformRows,
  pickPreferredPlatformRow,
} from "./platform-dedupe.ts";

const base = {
  workspaceId: "workspace",
  provider: "direct",
  type: "facebook",
  accountId: "223567576738910",
};

test("dedupePlatformRows collapses same account in one workspace", () => {
  const rows = [
    {
      ...base,
      id: "old",
      enabled: true,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-02T00:00:00Z"),
    },
    {
      ...base,
      id: "new",
      enabled: true,
      createdAt: new Date("2026-01-03T00:00:00Z"),
      updatedAt: new Date("2026-01-04T00:00:00Z"),
    },
  ];

  assert.deepEqual(
    dedupePlatformRows(rows).map((row) => row.id),
    ["new"]
  );
});

test("dedupePlatformRows still allows different external accounts", () => {
  const rows = [
    { ...base, id: "first", enabled: true, updatedAt: 1 },
    { ...base, id: "second", accountId: "different", enabled: true, updatedAt: 2 },
  ];

  assert.deepEqual(
    dedupePlatformRows(rows).map((row) => row.id),
    ["first", "second"]
  );
});

test("pickPreferredPlatformRow prefers enabled connection before timestamp", () => {
  const preferred = pickPreferredPlatformRow([
    { ...base, id: "disabled-new", enabled: false, updatedAt: 20 },
    { ...base, id: "enabled-old", enabled: true, updatedAt: 10 },
  ]);

  assert.equal(preferred?.id, "enabled-old");
});
