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
    rateLimits: { requestsPerHour: 200, requestsPerDay: 4800, publishPerDay: 200 },
    auth: createAuth(credentials),
    posting: createPosting(credentials),
    comments: createComments(),
    inbox: createInbox(
      typeof credentials.pageId === "string"
        ? credentials.pageId
        : typeof credentials.page_id === "string"
          ? credentials.page_id
          : null
    ),
  };
}
