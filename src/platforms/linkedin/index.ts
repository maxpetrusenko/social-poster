import type { PlatformModule } from "../_shared/types";
import type { ProviderCredentials } from "../_shared/base-platform";
import { config } from "./config";
import { createAuth } from "./auth";
import { createPosting } from "./posting";

export { config } from "./config";
export type { PlatformModule } from "../_shared/types";

export function createPlatformModule(
  credentials: ProviderCredentials,
  variant: "personal" | "company" = "personal"
): PlatformModule {
  return {
    id: variant === "company" ? "linkedin_company" : "linkedin",
    name: variant === "company" ? "LinkedIn (Company Page)" : "LinkedIn (Personal)",
    capabilities: [...config.capabilities],
    rateLimits: { requestsPerHour: 200, requestsPerDay: 100, publishPerDay: 100 },
    auth: createAuth(credentials, variant),
    posting: createPosting(credentials, variant),
  };
}
