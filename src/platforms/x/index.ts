import type { PlatformModule } from "../_shared/types";
import type { ProviderCredentials } from "../_shared/base-platform";
import { config } from "./config";
import { createAuth } from "./auth";
import { createPosting } from "./posting";
import { createComments } from "./comments";
import { createInbox } from "./inbox";

export { config } from "./config";
export type { PlatformModule } from "../_shared/types";

export function createPlatformModule(credentials: ProviderCredentials): PlatformModule {
  return {
    id: config.id,
    name: config.name,
    capabilities: [...config.capabilities],
    rateLimits: { requestsPerHour: 300, requestsPerDay: 2400, publishPerDay: 300 },
    auth: createAuth(credentials),
    posting: createPosting(credentials),
    comments: createComments(typeof credentials.handle === "string" ? credentials.handle : null),
    inbox: createInbox(),
  };
}
