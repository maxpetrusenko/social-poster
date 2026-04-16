import { OAuthError } from "./errors";
import { SocialProvider, type ProviderCredentials } from "./base";
import type { OAuthTokens } from "./types";

export function buildAuthUrl(
  baseUrl: string,
  params: Record<string, string | number | boolean | undefined>
) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export function normalizeTokens(body: Record<string, unknown>): OAuthTokens {
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new OAuthError(`Token response missing access_token: ${JSON.stringify(body)}`);
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
    tokenType: typeof body.token_type === "string" ? body.token_type : "Bearer",
    scope: typeof body.scope === "string" ? body.scope : undefined,
    raw: body,
  };
}

export abstract class OAuthProvider extends SocialProvider {
  protected clientIdKey = "clientId";
  protected clientSecretKey = "clientSecret";

  constructor(credentials: ProviderCredentials = {}) {
    super(credentials);
  }

  protected clientId() {
    return this.credential(this.clientIdKey, "client_id", "appId", "app_id");
  }

  protected clientSecret() {
    return this.credential(
      this.clientSecretKey,
      "client_secret",
      "appSecret",
      "app_secret"
    );
  }

  protected tokenToResult(body: Record<string, unknown>): OAuthTokens {
    return normalizeTokens(body);
  }
}
