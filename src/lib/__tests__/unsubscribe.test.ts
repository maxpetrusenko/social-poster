import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/marketing/unsubscribe";

describe("unsubscribe tokens", () => {
  it("round-trips signed unsubscribe payloads", () => {
    const token = createUnsubscribeToken({
      email: "Max@Example.com",
      scope: "marketing",
    });

    expect(verifyUnsubscribeToken(token)).toMatchObject({
      email: "max@example.com",
      scope: "marketing",
    });
  });

  it("rejects tampered tokens", () => {
    const token = createUnsubscribeToken({
      email: "max@example.com",
      scope: "marketing",
    });

    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
  });
});
