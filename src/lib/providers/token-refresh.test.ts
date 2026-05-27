import assert from "node:assert/strict";
import { test } from "vitest";
import { shouldRefreshToken } from "./token-refresh-policy.ts";

const nowMs = Date.UTC(2026, 3, 17);
const oneDayMs = 24 * 60 * 60 * 1000;

test("shouldRefreshToken refreshes tokens inside the expiry window", () => {
  assert.equal(
    shouldRefreshToken(
      { credentials: { expiresAt: nowMs + oneDayMs } },
      { nowMs, refreshWindowMs: 7 * oneDayMs }
    ),
    true
  );
});

test("shouldRefreshToken skips tokens outside the expiry window", () => {
  assert.equal(
    shouldRefreshToken(
      { credentials: { expiresAt: nowMs + 14 * oneDayMs } },
      { nowMs, refreshWindowMs: 7 * oneDayMs }
    ),
    false
  );
});

test("shouldRefreshToken periodically refreshes unknown-expiry tokens", () => {
  assert.equal(
    shouldRefreshToken(
      { credentials: { lastRefreshedAt: nowMs - 31 * oneDayMs } },
      { nowMs, unknownExpiryRefreshMs: 30 * oneDayMs }
    ),
    true
  );
});

test("shouldRefreshToken skips recently refreshed unknown-expiry tokens", () => {
  assert.equal(
    shouldRefreshToken(
      { credentials: { lastRefreshedAt: nowMs - 3 * oneDayMs } },
      { nowMs, unknownExpiryRefreshMs: 30 * oneDayMs }
    ),
    false
  );
});
