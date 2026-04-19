/**
 * Simple per-endpoint rate limiter.
 *
 * Tracks request timestamps per endpoint within a sliding time window
 * and returns a wait time in ms if the limit has been reached.
 */

export interface RateLimitRule {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

interface WindowEntry {
  timestamps: number[];
}

export class RateLimiter {
  private windows = new Map<string, WindowEntry>();
  private rules: Record<string, RateLimitRule>;
  private defaultRule: RateLimitRule;

  constructor(
    rules: Record<string, RateLimitRule> = {},
    defaultRule?: RateLimitRule
  ) {
    this.rules = rules;
    this.defaultRule = defaultRule ?? {
      maxRequests: 200,
      windowMs: 60 * 60 * 1000, // 1 hour
    };
  }

  /**
   * Check whether a request to `endpoint` is allowed.
   * Returns 0 if allowed, or the number of milliseconds to wait.
   */
  check(endpoint: string): number {
    const rule = this.rules[endpoint] ?? this.defaultRule;
    const now = Date.now();
    const entry = this.getEntry(endpoint);

    // Prune timestamps outside the window
    const cutoff = now - rule.windowMs;
    entry.timestamps = entry.timestamps.filter((t) => t > cutoff);

    if (entry.timestamps.length >= rule.maxRequests) {
      // Earliest timestamp still in window — wait until it expires
      const oldest = entry.timestamps[0]!;
      return oldest + rule.windowMs - now;
    }

    return 0;
  }

  /**
   * Record a request to `endpoint`. Call this after successfully making a
   * request. Returns the wait time (0 if not limited).
   */
  record(endpoint: string): number {
    const wait = this.check(endpoint);
    if (wait > 0) return wait;

    const entry = this.getEntry(endpoint);
    entry.timestamps.push(Date.now());
    return 0;
  }

  /** Reset all tracked state. */
  reset(): void {
    this.windows.clear();
  }

  /** Reset tracked state for a specific endpoint. */
  resetEndpoint(endpoint: string): void {
    this.windows.delete(endpoint);
  }

  private getEntry(endpoint: string): WindowEntry {
    let entry = this.windows.get(endpoint);
    if (!entry) {
      entry = { timestamps: [] };
      this.windows.set(endpoint, entry);
    }
    return entry;
  }
}
