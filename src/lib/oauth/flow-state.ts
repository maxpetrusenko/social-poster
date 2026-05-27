export type OAuthFlowCookieFlow = {
  nonce: string;
  codeVerifier?: string | null;
  redirectUri?: string | null;
  credentials?: {
    clientId?: string;
    clientSecret?: string;
  } | null;
  timestamp?: number | null;
};

export type OAuthFlowCookie = OAuthFlowCookieFlow & {
  flows?: OAuthFlowCookieFlow[] | null;
};

export const OAUTH_FLOW_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
export const OAUTH_FLOW_COOKIE_MAX_FLOWS = 5;

export function encodeOAuthFlowCookie(cookie: OAuthFlowCookie) {
  return Buffer.from(JSON.stringify(cookie), "utf8").toString("base64url");
}

export function decodeOAuthFlowCookie(value: string | null): OAuthFlowCookie | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    if (typeof parsed.nonce !== "string") return null;

    const current = readCookieFlow(parsed);
    if (!current) return null;
    const flows = Array.isArray(parsed.flows)
      ? parsed.flows
          .map((flow) => readCookieFlow(flow))
          .filter((flow): flow is OAuthFlowCookieFlow => Boolean(flow))
      : [];

    return {
      ...current,
      flows: dedupeCookieFlows([current, ...flows]),
    };
  } catch {
    return { nonce: value, codeVerifier: null };
  }
}

export function appendOAuthFlowCookieFlow(
  existing: OAuthFlowCookie | null,
  flow: OAuthFlowCookieFlow,
  now = Date.now()
): OAuthFlowCookie {
  const current = { ...flow, timestamp: flow.timestamp ?? now };
  const flows = dedupeCookieFlows([
    current,
    ...oauthFlowCookieFlows(existing).filter((candidate) => {
      if (candidate.nonce === current.nonce) return false;
      return !isExpiredCookieFlow(candidate, now);
    }),
  ]).slice(0, OAUTH_FLOW_COOKIE_MAX_FLOWS);

  return { ...flows[0], flows };
}

export function findOAuthFlowCookieFlow(
  cookie: OAuthFlowCookie | null,
  nonce: string | null | undefined
): OAuthFlowCookieFlow | null {
  if (!nonce) return null;
  return (
    oauthFlowCookieFlows(cookie).find((flow) => flow.nonce === nonce) ?? null
  );
}

export function removeOAuthFlowCookieFlow(
  cookie: OAuthFlowCookie | null,
  nonce: string | null | undefined,
  now = Date.now()
): OAuthFlowCookie | null {
  const flows = oauthFlowCookieFlows(cookie).filter((flow) => {
    if (flow.nonce === nonce) return false;
    return !isExpiredCookieFlow(flow, now);
  });

  return flows.length > 0 ? { ...flows[0], flows } : null;
}

export function oauthFlowCookieFlows(
  cookie: OAuthFlowCookie | null
): OAuthFlowCookieFlow[] {
  if (!cookie) return [];
  const current = readCookieFlow(cookie);
  const flows = Array.isArray(cookie.flows)
    ? cookie.flows
        .map((flow) => readCookieFlow(flow))
        .filter((flow): flow is OAuthFlowCookieFlow => Boolean(flow))
    : [];
  return dedupeCookieFlows(current ? [current, ...flows] : flows);
}

function readCookieFlow(value: unknown): OAuthFlowCookieFlow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.nonce !== "string") return null;

  return {
    nonce: source.nonce,
    codeVerifier:
      typeof source.codeVerifier === "string" ? source.codeVerifier : null,
    redirectUri:
      typeof source.redirectUri === "string" ? source.redirectUri : null,
    credentials: readCookieCredentials(source.credentials),
    timestamp: typeof source.timestamp === "number" ? source.timestamp : null,
  };
}

function dedupeCookieFlows(flows: OAuthFlowCookieFlow[]) {
  const seen = new Set<string>();
  const result: OAuthFlowCookieFlow[] = [];
  for (const flow of flows) {
    if (seen.has(flow.nonce)) continue;
    seen.add(flow.nonce);
    result.push(flow);
  }
  return result;
}

function isExpiredCookieFlow(flow: OAuthFlowCookieFlow, now: number) {
  return typeof flow.timestamp === "number"
    ? now - flow.timestamp > OAUTH_FLOW_COOKIE_MAX_AGE_MS
    : false;
}

function readCookieCredentials(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const clientId =
    typeof source.clientId === "string" && source.clientId.trim()
      ? source.clientId.trim()
      : undefined;
  const clientSecret =
    typeof source.clientSecret === "string" && source.clientSecret.trim()
      ? source.clientSecret.trim()
      : undefined;

  return clientId || clientSecret ? { clientId, clientSecret } : null;
}
