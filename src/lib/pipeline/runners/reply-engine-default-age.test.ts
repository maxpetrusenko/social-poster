import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/replies/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/replies/config")>();
  return { ...actual, REPLY_TARGETS: { ...actual.REPLY_TARGETS, maxTweetAgeMinutes: 77 } };
});

import { parseReplyEngineConfig } from "./reply-engine.ts";

describe("reply engine default freshness window", () => {
  it("reads the default from REPLY_TARGETS.maxTweetAgeMinutes", () => {
    expect(parseReplyEngineConfig(null).maxTweetAgeMinutes).toBe(77);
  });

  it("still lets schedule config override it", () => {
    expect(parseReplyEngineConfig({ maxTweetAgeMinutes: 30 }).maxTweetAgeMinutes).toBe(30);
  });
});
