import { describe, expect, it } from "vitest";
import { createFixedWindowRateLimiter } from "@/lib/support/rate-limit";

describe("createFixedWindowRateLimiter", () => {
  it("uses an injected clock and supports deterministic resets", () => {
    let now = 1_000;
    const limiter = createFixedWindowRateLimiter({
      limit: 2,
      windowMs: 10_000,
      now: () => now,
    });

    expect(limiter.check("user-1")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("user-1")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("user-1")).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
      resetAt: 11_000,
    });
    expect(limiter.check("user-2")).toMatchObject({ allowed: true, remaining: 1 });

    limiter.reset("user-1");
    expect(limiter.check("user-1")).toMatchObject({ allowed: true, remaining: 1 });

    now = 11_000;
    expect(limiter.check("user-2")).toMatchObject({ allowed: true, remaining: 1 });
  });
});
