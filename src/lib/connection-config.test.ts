import assert from "node:assert/strict";
import test from "node:test";

import { readStoredConnectionConfig } from "./connection-config.ts";

test("readStoredConnectionConfig preserves Bird session health", () => {
  const config = readStoredConnectionConfig({
    authMethod: "bird_cli",
    credentials: {
      enableDirectFallbackForPublishing: true,
    },
    birdSession: {
      status: "ok",
      checkedAt: "2026-04-19T12:00:00.000Z",
      source: "browser_session",
      message: "Bird reached X.",
      error: null,
    },
  });

  assert.equal(config.birdSession?.status, "ok");
  assert.equal(config.birdSession?.checkedAt, "2026-04-19T12:00:00.000Z");
  assert.equal(config.birdSession?.source, "browser_session");
  assert.equal(config.birdSession?.message, "Bird reached X.");
  assert.equal(config.birdSession?.error, null);
  assert.equal(config.enableDirectFallbackForPublishing, true);
});
