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

export const SOCIAL_ACCOUNTS_PATH = "/dashboard/workspace-settings/social-accounts";

const OAUTH_RETURN_PREFIXES = [
  "/dashboard/workspace-settings",
  "/dashboard/settings",
  "/dashboard/platforms",
  "/dashboard/profiles",
  "/dashboard/posts",
  "/dashboard/calendar",
  "/dashboard/campaigns",
  "/dashboard/publish",
  "/dashboard/schedules",
] as const;

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Post-OAuth return target. Same-origin app path only; trailing punctuation
 * copied from chat text is stripped; anything outside a small allowlist of
 * dashboard routes falls back to the social accounts page.
 */
export function sanitizeOAuthReturnPath(candidate?: string | null) {
  const safe = sanitizeAppNextPath(candidate, SOCIAL_ACCOUNTS_PATH);
  const queryStart = safe.search(/[?#]/);
  const rawPath = queryStart === -1 ? safe : safe.slice(0, queryStart);
  const suffix = queryStart === -1 ? "" : safe.slice(queryStart);
  const path = rawPath.replace(TRAILING_PUNCTUATION, "").replace(/\/+$/, "");
  const known = OAUTH_RETURN_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
  return known ? `${path}${suffix}` : SOCIAL_ACCOUNTS_PATH;
}
