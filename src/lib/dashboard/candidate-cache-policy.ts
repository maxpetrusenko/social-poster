const DEFAULT_CANDIDATE_CACHE_TTL_MS = 15 * 60 * 1000;

export function shouldRefreshCandidateCache(
  fetchedAt: Date | null,
  ttlMs = DEFAULT_CANDIDATE_CACHE_TTL_MS
): boolean {
  if (!fetchedAt) return true;
  return Date.now() - fetchedAt.getTime() > ttlMs;
}
