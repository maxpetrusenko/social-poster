import { describe, expect, it } from "vitest";

import {
  BOARDY_VERIFIED_STATUS_ALLOWLIST,
  normalizeVerifiedBoardyStatusUrl,
  validateReferenceExamples,
} from "@/lib/work-to-post/reference-examples";

describe("Boardy reference provenance", () => {
  it("accepts only the versioned verified status allowlist", () => {
    expect(BOARDY_VERIFIED_STATUS_ALLOWLIST.version).toBe("2026-07-24.1");

    for (const statusId of BOARDY_VERIFIED_STATUS_ALLOWLIST.statusIds) {
      expect(
        normalizeVerifiedBoardyStatusUrl(
          `https://x.com/boardyai/status/${statusId}`,
          "@boardyai"
        )
      ).toBe(`https://x.com/boardyai/status/${statusId}`);
    }
  });

  it.each([
    ["invented numeric status", "https://x.com/boardyai/status/2080349222105416125"],
    ["deleted or unverified numeric status", "https://x.com/boardyai/status/1900000000000000000"],
    ["tracking query", "https://x.com/boardyai/status/2080349222105416126?ref=copy"],
    ["wrong host", "https://example.com/boardyai/status/2080349222105416126"],
  ])("fails closed for %s", (_label, sourceUrl) => {
    expect(() =>
      normalizeVerifiedBoardyStatusUrl(sourceUrl, "@boardyai")
    ).toThrow(/verified @boardyai status/i);
  });

  it("fails closed for a mismatched author", () => {
    expect(() =>
      normalizeVerifiedBoardyStatusUrl(
        "https://x.com/boardyai/status/2080349222105416126",
        "@someone"
      )
    ).toThrow(/verified @boardyai status/i);
  });

  it("enforces the verified allowlist at the angle generator boundary", () => {
    expect(() =>
      validateReferenceExamples([
        { id: "one", sourceUrl: "https://x.com/boardyai/status/2080349222105416125", mechanism: "compressed_build_log" },
        { id: "two", sourceUrl: "https://x.com/boardyai/status/2080450390315647056", mechanism: "counterintuitive_constraint" },
        { id: "three", sourceUrl: "https://x.com/boardyai/status/2080304998823428215", mechanism: "concrete_before_claim" },
      ])
    ).toThrow(/verified @boardyai status/i);
  });
});
