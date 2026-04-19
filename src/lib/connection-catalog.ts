import type { PlatformType } from "./platforms";

import { connectionDefinitions as xDefinitions } from "@/platforms/x/config";
import { connectionDefinitions as linkedinDefinitions } from "@/platforms/linkedin/config";
import { connectionDefinitions as instagramDefinitions } from "@/platforms/instagram/config";
import { connectionDefinitions as facebookDefinitions } from "@/platforms/facebook/config";
import { connectionDefinitions as threadsDefinitions } from "@/platforms/threads/config";
import { connectionDefinitions as tiktokDefinitions } from "@/platforms/tiktok/config";
import { connectionDefinitions as blueskyDefinitions } from "@/platforms/bluesky/config";
import { connectionDefinitions as mastodonDefinitions } from "@/platforms/mastodon/config";
import { connectionDefinitions as youtubeDefinitions } from "@/platforms/youtube/config";
import { connectionDefinitions as pinterestDefinitions } from "@/platforms/pinterest/config";
import { connectionDefinitions as googleBusinessDefinitions } from "@/platforms/google-business/config";
import { connectionDefinitions as redditDefinitions } from "@/platforms/reddit/config";
import { connectionDefinitions as whatsappDefinitions } from "@/platforms/whatsapp/config";

export type {
  ConnectionField,
  ConnectionFieldType,
  ConnectionMethod,
  ConnectionMethodInfoTooltip,
  ConnectionPlatformDefinition,
} from "@/platforms/_shared/connection-config";

import type { ConnectionPlatformDefinition } from "@/platforms/_shared/connection-config";

export const CONNECTION_PLATFORM_DEFINITIONS: ConnectionPlatformDefinition[] = [
  ...xDefinitions,
  ...linkedinDefinitions,
  ...instagramDefinitions,
  ...facebookDefinitions,
  ...threadsDefinitions,
  ...tiktokDefinitions,
  ...blueskyDefinitions,
  ...mastodonDefinitions,
  ...youtubeDefinitions,
  ...pinterestDefinitions,
  ...googleBusinessDefinitions,
  ...redditDefinitions,
  ...whatsappDefinitions,
];

export function getConnectionPlatformDefinition(type: PlatformType) {
  return CONNECTION_PLATFORM_DEFINITIONS.find((item) => item.type === type);
}
