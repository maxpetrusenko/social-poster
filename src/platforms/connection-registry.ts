import type { ConnectionPlatformDefinition } from "./_shared/connection-config";

import { connectionDefinitions as bluesky } from "./bluesky/config";
import { connectionDefinitions as facebook } from "./facebook/config";
import { connectionDefinitions as googleBusiness } from "./google-business/config";
import { connectionDefinitions as instagram } from "./instagram/config";
import { connectionDefinitions as linkedin } from "./linkedin/config";
import { connectionDefinitions as mastodon } from "./mastodon/config";
import { connectionDefinitions as pinterest } from "./pinterest/config";
import { connectionDefinitions as threads } from "./threads/config";
import { connectionDefinitions as tiktok } from "./tiktok/config";
import { connectionDefinitions as x } from "./x/config";
import { connectionDefinitions as youtube } from "./youtube/config";

const allDefinitions: ConnectionPlatformDefinition[] = [
  ...x,
  ...linkedin,
  ...instagram,
  ...facebook,
  ...threads,
  ...tiktok,
  ...bluesky,
  ...mastodon,
  ...youtube,
  ...pinterest,
  ...googleBusiness,
];

/** Look up a platform's connection definition by type (e.g. "facebook"). */
export function getConnectionDefinition(
  platformType: string
): ConnectionPlatformDefinition | undefined {
  return allDefinitions.find((d) => d.type === platformType);
}
