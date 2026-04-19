import { BlueskyProvider } from "../../lib/providers/bluesky";
import type { ProviderCredentials } from "../_shared/base-platform";
import type { PlatformAuth } from "../_shared/types";

export function createAuth(credentials: ProviderCredentials): PlatformAuth {
  const provider = new BlueskyProvider(credentials);
  return {
    authType: "session",
    requiredScopes: provider.requiredScopes,
    getAuthUrl: () => provider.getAuthUrl(),
    exchangeCode: () => provider.exchangeCode(),
    refreshToken: (t) => provider.refreshToken(t),
    getProfile: (t) => provider.getProfile(t),
  };
}
