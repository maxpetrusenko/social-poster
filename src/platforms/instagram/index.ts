import type { PlatformModule } from "../_shared/types";
import type { ProviderCredentials } from "../_shared/base-platform";
import { config } from "./config";
import { createAuth } from "./auth";
import { createPosting } from "./posting";

export { config } from "./config";
export type { PlatformModule } from "../_shared/types";

export function createPlatformModule(
  credentials: ProviderCredentials,
  variant: "business" | "personal" = "business"
): PlatformModule {
  return {
    id: variant === "personal" ? "instagram_personal" : "instagram",
    name: variant === "personal" ? "Instagram (Personal)" : "Instagram",
    capabilities: [...config.capabilities],
    rateLimits: { requestsPerHour: 200, requestsPerDay: 200, publishPerDay: 25 },
    auth: createAuth(credentials, variant),
    posting: createPosting(credentials, variant),
  };
}
