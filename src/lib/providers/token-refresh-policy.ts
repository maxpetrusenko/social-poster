import {
  readTokenExpiresAt,
  readTokenLastRefreshedAt,
} from "./credentials";

export const DEFAULT_REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const DEFAULT_UNKNOWN_EXPIRY_REFRESH_MS = 30 * 24 * 60 * 60 * 1000;

export function shouldRefreshToken(
  config: Record<string, unknown> | null | undefined,
  options: {
    nowMs: number;
    expiresAt?: number | null;
    refreshWindowMs?: number;
    unknownExpiryRefreshMs?: number;
  }
) {
  const expiresAt = options.expiresAt ?? readTokenExpiresAt(config);
  if (expiresAt !== null && expiresAt !== undefined) {
    return expiresAt <= options.nowMs + (options.refreshWindowMs ?? DEFAULT_REFRESH_WINDOW_MS);
  }

  const lastRefreshedAt = readTokenLastRefreshedAt(config);
  if (!lastRefreshedAt) return true;

  return (
    lastRefreshedAt <=
    options.nowMs - (options.unknownExpiryRefreshMs ?? DEFAULT_UNKNOWN_EXPIRY_REFRESH_MS)
  );
}
