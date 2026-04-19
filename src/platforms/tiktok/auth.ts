import { TikTokProvider } from "../../lib/providers/tiktok";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformAuth } from "../_shared/types";

export function createAuth(credentials: ProviderCredentials): PlatformAuth {
  const provider = new TikTokProvider(credentials);
  return {
    authType: "oauth2",
    requiredScopes: provider.requiredScopes,
    getAuthUrl: (r, s, v) => provider.getAuthUrl(r, s, v),
    exchangeCode: (c, r, v) => provider.exchangeCode(c, r, v),
    refreshToken: (t) => provider.refreshToken(t),
    getProfile: (t) => provider.getProfile(t),
  };
}
