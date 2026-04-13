import test from "node:test";
import assert from "node:assert/strict";
import { getLatePlatformFailure, resolvePublishAccountId } from "./publisher.ts";

test("resolvePublishAccountId prefers owned default ids over imported stale ids", () => {
  assert.equal(
    resolvePublishAccountId("linkedin", "stale-imported-id"),
    "69024a4c9d65616f16a5c5c0"
  );
  assert.equal(
    resolvePublishAccountId("twitter", "stale-imported-id"),
    "690248619d65616f16a5c5bc"
  );
});

test("resolvePublishAccountId falls back to provided id for unknown platforms", () => {
  assert.equal(resolvePublishAccountId("pinterest", "custom-id"), "custom-id");
  assert.equal(resolvePublishAccountId("unknown"), null);
});

test("getLatePlatformFailure detects pending platform errors inside 200 responses", () => {
  const failure = getLatePlatformFailure(
    "twitter",
    {
      error: "Publishing encountered temporary errors.",
      platformResults: [
        {
          platform: "twitter",
          status: "pending",
          error: "HTTP error! status: 402 - credits depleted",
        },
      ],
    },
    {
      status: "pending",
      errorMessage: "HTTP error! status: 402 - credits depleted",
    }
  );

  assert.deepEqual(failure, {
    classification: "provider_error",
    error: "HTTP error! status: 402 - credits depleted",
  });
});
