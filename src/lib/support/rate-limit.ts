type FixedWindowRateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
};

type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfterSeconds: number; resetAt: number };

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: FixedWindowRateLimiterOptions) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("Rate limit must be a positive integer.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("Rate limit window must be positive.");
  }

  const entries = new Map<string, RateLimitEntry>();

  return {
    check(key: string): RateLimitResult {
      const checkedAt = now();
      const current = entries.get(key);
      if (!current || checkedAt >= current.resetAt) {
        const resetAt = checkedAt + windowMs;
        entries.set(key, { count: 1, resetAt });
        return { allowed: true, remaining: limit - 1, resetAt };
      }

      if (current.count >= limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - checkedAt) / 1000)),
          resetAt: current.resetAt,
        };
      }

      current.count += 1;
      return {
        allowed: true,
        remaining: limit - current.count,
        resetAt: current.resetAt,
      };
    },

    reset(key?: string) {
      if (key) {
        entries.delete(key);
        return;
      }
      entries.clear();
    },
  };
}

// Process-local by design for the current single-instance deployment. Replace with a shared
// store before running multiple application instances so users cannot bypass limits per process.
export const supportTicketRateLimiter = createFixedWindowRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
});
