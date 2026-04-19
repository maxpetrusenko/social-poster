import { config as blueskyConfig } from "./bluesky/config";
import { config as facebookConfig } from "./facebook/config";
import { config as googleBusinessConfig } from "./google-business/config";
import { config as instagramConfig } from "./instagram/config";
import { config as linkedinConfig } from "./linkedin/config";
import { config as mastodonConfig } from "./mastodon/config";
import { config as pinterestConfig } from "./pinterest/config";
import { config as threadsConfig } from "./threads/config";
import { config as tiktokConfig } from "./tiktok/config";
import { config as xConfig } from "./x/config";
import { config as youtubeConfig } from "./youtube/config";

export const platformConfigs = [
  xConfig,
  linkedinConfig,
  instagramConfig,
  facebookConfig,
  threadsConfig,
  tiktokConfig,
  blueskyConfig,
  mastodonConfig,
  youtubeConfig,
  pinterestConfig,
  googleBusinessConfig,
] as const;

export type PlatformConfig = (typeof platformConfigs)[number];

export function getPlatformConfig(idOrSlug: string): PlatformConfig | undefined {
  return platformConfigs.find((config) => {
    if (config.id === idOrSlug || config.slug === idOrSlug) return true;
    return getConfigVariants(config).includes(idOrSlug);
  });
}

function getConfigVariants(config: PlatformConfig): readonly string[] {
  return "variants" in config && Array.isArray(config.variants)
    ? config.variants
    : [];
}
