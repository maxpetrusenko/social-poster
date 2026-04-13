import test from "node:test";
import assert from "node:assert/strict";
import { shouldRefreshCandidateCache } from "./candidate-cache-policy.ts";

test("candidate cache refreshes when empty", () => {
  assert.equal(shouldRefreshCandidateCache(null), true);
});

test("candidate cache stays warm inside ttl", () => {
  assert.equal(
    shouldRefreshCandidateCache(new Date(Date.now() - 5 * 60 * 1000), 15 * 60 * 1000),
    false
  );
});

test("candidate cache refreshes after ttl", () => {
  assert.equal(
    shouldRefreshCandidateCache(new Date(Date.now() - 20 * 60 * 1000), 15 * 60 * 1000),
    true
  );
});
