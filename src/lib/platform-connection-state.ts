export const DISCONNECTED_CONNECTION_FLAG = "disconnectedAt";

export function isPlatformConnectionDisconnected(
  config: Record<string, unknown> | null | undefined
) {
  const value = config?.[DISCONNECTED_CONNECTION_FLAG];
  return typeof value === "string" && value.trim().length > 0;
}

export const CONNECTION_ISSUE_KEY = "connectionIssue";

export type ConnectionIssueStatus = "token_expired" | "disconnected";

export type ConnectionIssue = {
  status: ConnectionIssueStatus;
  reason: string;
  at: string;
};

export function readConnectionIssue(
  config: Record<string, unknown> | null | undefined
): ConnectionIssue | null {
  const value = config?.[CONNECTION_ISSUE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.status !== "token_expired" && record.status !== "disconnected") {
    return null;
  }
  return {
    status: record.status,
    reason: typeof record.reason === "string" ? record.reason : "",
    at: typeof record.at === "string" ? record.at : "",
  };
}

/** Connection status shown by GET /api/platforms. Observed auth failures win over a still-future expiry. */
export function resolveConnectionStatus(
  config: Record<string, unknown> | null | undefined,
  expiresAt: number | null,
  now: number = Date.now()
): "connected" | "token_expired" | "disconnected" {
  if (isPlatformConnectionDisconnected(config)) return "disconnected";
  const issue = readConnectionIssue(config);
  if (issue) return issue.status;
  if (expiresAt !== null && expiresAt < now) return "token_expired";
  return "connected";
}

/**
 * Failures that are never a dead-credential signal even when the provider
 * answers 401/403: X returns 403 for duplicate content and for policy/permission
 * refusals; network drops ("socket disconnected") must not read as Zernio
 * "disconnected".
 */
const NON_AUTH_FAILURE_PATTERN =
  /duplicate|already (?:tweeted|posted|exists|been posted)|rate.?limit|too many requests|not permitted to|not allowed to|client-not-enrolled|socket|\beconn|\betimedout|timed? ?out|network|fetch failed/;

const DISCONNECTED_PATTERN =
  /\baccount (?:is |has been |was )?(?:disconnected|removed|revoked)|reconnect (?:the |your |this )?account|re-?connect(?:ion)? required|access (?:has been |was )?revoked|token (?:has been |was )?revoked/;

const TOKEN_EXPIRED_PATTERN =
  /token (?:has )?expired|expired token|invalid[_ ]token|session (?:has been )?invalidated|invalid oauth|missing access token/;

export function isNonAuthFailure(message: string | null | undefined): boolean {
  return NON_AUTH_FAILURE_PATTERN.test((message ?? "").toLowerCase());
}

/** HTTP status embedded in provider error text, e.g. "X API error 403: ...". */
export function readHttpStatusFromText(message: string | null | undefined): number | null {
  const match = (message ?? "").match(/\berror (\d{3})\b/i);
  return match ? Number(match[1]) : null;
}

/**
 * Decide whether a provider failure message/payload means the stored
 * credentials are no longer usable (Graph code 190, 401, explicit token text,
 * Zernio "account disconnected"), and which status to surface for it.
 * A bare 403 is not enough: it is also used for duplicates and permissions.
 */
export function classifyAuthFailure(input: {
  message?: string | null;
  statusCode?: number | null;
  raw?: unknown;
}): ConnectionIssueStatus | null {
  const message = (input.message ?? "").toLowerCase();
  const code = readGraphErrorCode(input.raw) ?? readGraphErrorCodeFromText(message);

  if (code === 190 || code === 102) return "token_expired";
  if (NON_AUTH_FAILURE_PATTERN.test(message)) return null;
  if (DISCONNECTED_PATTERN.test(message)) return "disconnected";
  if (input.statusCode === 401 || TOKEN_EXPIRED_PATTERN.test(message)) {
    return "token_expired";
  }
  return null;
}

export type AuthFailureInput = {
  message?: string | null;
  statusCode?: number | null;
  raw?: unknown;
  classification?: string;
};

/**
 * Status to persist for a failed publish/refresh, or null when credentials look fine.
 * An auth_error classification alone only counts when it is not a 403 or a known
 * non-auth failure: providers classify every 403 as auth_error, and X uses 403 for
 * duplicate content and permission refusals, which must not flag a healthy account.
 */
export function resolveAuthFailureStatus(input: AuthFailureInput): ConnectionIssueStatus | null {
  const detected = classifyAuthFailure(input);
  if (detected) return detected;
  if (input.classification !== "auth_error") return null;
  if (isNonAuthFailure(input.message)) return null;
  const httpStatus = input.statusCode ?? readHttpStatusFromText(input.message);
  if (httpStatus === 403) return null;
  return "token_expired";
}

function readGraphErrorCode(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const error = (raw as Record<string, unknown>).error;
  if (error && typeof error === "object") {
    const code = (error as Record<string, unknown>).code;
    if (typeof code === "number") return code;
  }
  return null;
}

function readGraphErrorCodeFromText(message: string): number | null {
  const match = message.match(/"code"\s*:\s*(\d+)/);
  return match ? Number(match[1]) : null;
}
