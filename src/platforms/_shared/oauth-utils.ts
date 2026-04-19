/**
 * Reusable OAuth utilities extracted from src/lib/providers/oauth.ts.
 *
 * These can be used by new platform modules without pulling in the
 * OAuthProvider class hierarchy.
 */

import crypto from "node:crypto";
import type { OAuthTokens } from "./types";

// ---------------------------------------------------------------------------
// Auth URL builder
// ---------------------------------------------------------------------------

export function buildAuthUrl(
  baseUrl: string,
  params: Record<string, string | number | boolean | undefined>
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Token normalisation
// ---------------------------------------------------------------------------

export function normalizeTokens(body: Record<string, unknown>): OAuthTokens {
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error(
      `Token response missing access_token: ${JSON.stringify(body)}`
    );
  }

  return {
    accessToken,
    refreshToken:
      typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresIn:
      typeof body.expires_in === "number"
        ? body.expires_in
        : typeof body.expires === "number"
          ? body.expires
          : undefined,
    tokenType:
      typeof body.token_type === "string" ? body.token_type : "Bearer",
    scope: typeof body.scope === "string" ? body.scope : undefined,
    raw: body,
  };
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

export function generateCodeVerifier(length = 64): string {
  return crypto.randomBytes(length).toString("base64url").slice(0, length);
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

// ---------------------------------------------------------------------------
// Token refresh helper
// ---------------------------------------------------------------------------

export async function refreshOAuthToken(
  tokenUrl: string,
  refreshToken: string,
  clientId: string,
  clientSecret?: string,
  extraParams?: Record<string, string>
): Promise<OAuthTokens> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    ...(extraParams ?? {}),
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Token refresh failed (${response.status}): ${text.slice(0, 500)}`
    );
  }

  const body = (await response.json()) as Record<string, unknown>;
  const tokens = normalizeTokens(body);
  // Preserve the original refresh token if the response doesn't include a new one
  return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken };
}
