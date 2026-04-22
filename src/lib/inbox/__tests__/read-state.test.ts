import { describe, expect, it } from "vitest";

import { shouldMarkIncomingSeen } from "@/lib/inbox/read-state";

describe("inbox read state", () => {
  it("marks pulled messages as seen when they are older than the surface watermark", () => {
    expect(
      shouldMarkIncomingSeen({
        sentAt: new Date("2026-04-20T12:00:00Z"),
        createdAt: new Date("2026-04-21T12:00:00Z"),
        seenAt: new Date("2026-04-20T13:00:00Z"),
      })
    ).toBe(true);
  });

  it("keeps messages new when they arrived after the surface watermark", () => {
    expect(
      shouldMarkIncomingSeen({
        sentAt: new Date("2026-04-20T14:00:00Z"),
        createdAt: new Date("2026-04-21T12:00:00Z"),
        seenAt: new Date("2026-04-20T13:00:00Z"),
      })
    ).toBe(false);
  });

  it("keeps messages new when the surface has never been seen", () => {
    expect(
      shouldMarkIncomingSeen({
        sentAt: new Date("2026-04-20T12:00:00Z"),
        createdAt: new Date("2026-04-21T12:00:00Z"),
        seenAt: null,
      })
    ).toBe(false);
  });
});
