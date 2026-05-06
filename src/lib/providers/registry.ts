/**
 * @deprecated Legacy provider registry — use src/platforms/registry.ts instead.
 * This file is kept for backward compatibility with existing imports.
 * New platform integrations should use PlatformModule from src/platforms/_shared/.
 */
import type { SocialProvider, ProviderCredentials } from "./base";
import { BlueskyProvider } from "./bluesky";
import { FacebookProvider } from "./facebook";
import { GoogleBusinessProvider } from "./google-business";
import {
  InstagramLoginProvider,
  InstagramPersonalProvider,
} from "./instagram-personal";
import { LinkedInCompanyProvider } from "./linkedin-company";
import { LinkedInPersonalProvider } from "./linkedin-personal";
import { MastodonProvider } from "./mastodon";
import { PinterestProvider } from "./pinterest";
import { ThreadsProvider } from "./threads";
import { TikTokProvider } from "./tiktok";
import { TwitterProvider } from "./twitter";
import { YouTubeProvider } from "./youtube";

type ProviderFactory = (credentials: ProviderCredentials) => SocialProvider;

const providers: Record<string, ProviderFactory> = {
  bluesky: (c) => new BlueskyProvider(c),
  facebook: (c) => new FacebookProvider(c),
  google_business: (c) => new GoogleBusinessProvider(c),
  instagram: (c) => new InstagramLoginProvider(c),
  instagram_personal: (c) => new InstagramPersonalProvider(c),
  linkedin: (c) => new LinkedInPersonalProvider(c),
  linkedin_company: (c) => new LinkedInCompanyProvider(c),
  linkedin_personal: (c) => new LinkedInPersonalProvider(c),
  mastodon: (c) => new MastodonProvider(c),
  pinterest: (c) => new PinterestProvider(c),
  threads: (c) => new ThreadsProvider(c),
  tiktok: (c) => new TikTokProvider(c),
  twitter: (c) => new TwitterProvider(c),
  x: (c) => new TwitterProvider(c),
  youtube: (c) => new YouTubeProvider(c),
};

export function hasNativeProvider(platformType: string): boolean {
  return platformType in providers;
}

export function getProvider(
  platformKey: string,
  credentials: ProviderCredentials
): SocialProvider {
  const factory = providers[platformKey];
  if (!factory) {
    throw new Error(`No native provider registered for platform: ${platformKey}`);
  }
  return factory(credentials);
}
