import { LinkedInPersonalProvider } from "../../lib/providers/linkedin-personal";
import { LinkedInCompanyProvider } from "../../lib/providers/linkedin-company";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformAuth } from "../_shared/types";

export function createAuth(
  credentials: ProviderCredentials,
  variant: "personal" | "company" = "personal"
): PlatformAuth {
  const provider =
    variant === "company"
      ? new LinkedInCompanyProvider(credentials)
      : new LinkedInPersonalProvider(credentials);

  return {
    authType: "oauth2",
    requiredScopes: provider.requiredScopes,
    getAuthUrl: (r, s) => provider.getAuthUrl(r, s),
    exchangeCode: (c, r) => provider.exchangeCode(c, r),
    refreshToken: (t) => provider.refreshToken(t),
    getProfile: (t) => provider.getProfile(t),
  };
}
