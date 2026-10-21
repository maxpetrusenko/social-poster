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
 * Decide whether a provider failure message/payload means the stored
 * credentials are no longer usable (Graph code 190, 401/403, Zernio
 * "disconnected"), and which status to surface for it.
 */
export function classifyAuthFailure(input: {
  message?: string | null;
  statusCode?: number | null;
  raw?: unknown;
}): ConnectionIssueStatus | null {
  const message = (input.message ?? "").toLowerCase();
  const code = readGraphErrorCode(input.raw) ?? readGraphErrorCodeFromText(message);

  if (
    /disconnected|account (?:was )?removed|reconnect (?:the )?account|re-?connect required|revoked/.test(
      message
    )
  ) {
    return "disconnected";
  }
  if (code === 190 || code === 102) return "token_expired";
  if (
    input.statusCode === 401 ||
    input.statusCode === 403 ||
    /token (?:has )?expired|expired token|invalid[_ ]token|session (?:has been )?invalidated|invalid oauth|missing access token/.test(
      message
    )
  ) {
    return "token_expired";
  }
  return null;
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
