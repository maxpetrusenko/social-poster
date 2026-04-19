import type { PlatformModule } from "../_shared/types";
import type { ProviderCredentials } from "../_shared/base-platform";
import { config } from "./config";
import { createAuth } from "./auth";
import { createPosting } from "./posting";

export { config } from "./config";
export type { PlatformModule } from "../_shared/types";

export function createPlatformModule(credentials: ProviderCredentials): PlatformModule {
  return {
    id: config.id,
    name: config.name,
    capabilities: [...config.capabilities],
    rateLimits: { requestsPerHour: 5000, requestsPerDay: 50000, publishPerDay: 100 },
    auth: createAuth(credentials),
    posting: createPosting(credentials),
  };
}
