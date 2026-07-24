const DEFAULT_NEXT_PATH = "/dashboard";
const AUTH_LOOP_PREFIXES = ["/auth", "/login", "/api/auth"] as const;

function isAuthLoopPath(pathname: string) {
  const normalized = pathname.toLowerCase();
  return AUTH_LOOP_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

/**
 * Returns a same-origin application path suitable for a post-auth redirect.
 * URL construction treats protocol-relative and backslash-prefixed values as
 * external hosts, so reject those forms before parsing.
 */
export function sanitizeAppNextPath(
  candidate?: string | null,
  fallback = DEFAULT_NEXT_PATH
) {
  if (
    !candidate ||
    candidate !== candidate.trim() ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  ) {
    return fallback;
  }

  try {
    const base = new URL("https://smmagent.invalid");
    const parsed = new URL(candidate, base);

    if (parsed.origin !== base.origin || isAuthLoopPath(parsed.pathname)) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
