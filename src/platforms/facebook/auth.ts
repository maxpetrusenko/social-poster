import { FacebookProvider } from "../../lib/providers/facebook";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformAuth } from "../_shared/types";

export function createAuth(credentials: ProviderCredentials): PlatformAuth {
  const provider = new FacebookProvider(credentials);
  return {
    authType: "oauth2",
    requiredScopes: provider.requiredScopes,
    getAuthUrl: (r, s) => provider.getAuthUrl(r, s),
    exchangeCode: (c, r) => provider.exchangeCode(c, r),
    refreshToken: (t) => provider.refreshToken(t),
    getProfile: (t) => provider.getProfile(t),
  };
}
