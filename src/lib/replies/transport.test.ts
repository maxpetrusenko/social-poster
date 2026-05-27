import { test } from "vitest";
import assert from "node:assert/strict";
import { resolveReplyTransport } from "./transport.ts";

test("resolveReplyTransport prefers bird for bird provider", () => {
  assert.equal(
    resolveReplyTransport({
      provider: "bird",
      config: {
        authMethod: "bird_cli",
      },
    }),
    "bird"
  );
});

test("resolveReplyTransport uses x_api for direct x api connections", () => {
  assert.equal(
    resolveReplyTransport({
      provider: "direct",
      config: {
        authMethod: "x_api",
      },
    }),
    "x_api"
  );
});
