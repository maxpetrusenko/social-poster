export const AUTH_STRATEGIES = [
  "manual",
  "oauth_authorization_code",
  "oauth_pkce",
  "oauth_client_credentials",
  "wix_app_instance",
] as const;

export type AuthStrategy = (typeof AUTH_STRATEGIES)[number];

export function defaultAuthStrategy(authType?: "manual" | "oauth"): AuthStrategy {
  return authType === "oauth" ? "oauth_authorization_code" : "manual";
}

export function usesRedirectCallback(strategy: AuthStrategy) {
  return strategy === "oauth_authorization_code" || strategy === "oauth_pkce";
}

export function usesAppInstanceToken(strategy: AuthStrategy) {
  return strategy === "wix_app_instance";
}
