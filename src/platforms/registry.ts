/**
 * Unified platform registry.
 *
 * Maps platform IDs to PlatformModule instances. Initially delegates to the
 * legacy provider registry via the LegacyProviderAdapter so that existing
 * providers keep working without changes.
 */

import type { PlatformModule, PlatformCapability } from "./_shared/types";
import type { ProviderCredentials } from "./_shared/base-platform";
import { LegacyProviderAdapter } from "./_shared/base-platform";
import {
  getProvider as getLegacyProvider,
  hasNativeProvider,
} from "../lib/providers/registry";

// Per-platform module factories
import { createPlatformModule as createX } from "./x";
import { createPlatformModule as createLinkedIn } from "./linkedin";
import { createPlatformModule as createInstagram } from "./instagram";
import { createPlatformModule as createFacebook } from "./facebook";
import { createPlatformModule as createThreads } from "./threads";
import { createPlatformModule as createTikTok } from "./tiktok";
import { createPlatformModule as createBluesky } from "./bluesky";
import { createPlatformModule as createMastodon } from "./mastodon";
import { createPlatformModule as createYouTube } from "./youtube";
import { createPlatformModule as createPinterest } from "./pinterest";
import { createPlatformModule as createGoogleBusiness } from "./google-business";

export {
  getPlatformConfig,
  platformConfigs,
  type PlatformConfig,
} from "./config-registry";

// ---------------------------------------------------------------------------
// New-style platform module factories
// ---------------------------------------------------------------------------

type PlatformFactory = (credentials: ProviderCredentials) => PlatformModule;

const platformFactories: Record<string, PlatformFactory> = {
  twitter: (c) => createX(c),
  x: (c) => createX(c),
  linkedin: (c) => createLinkedIn(c, "personal"),
  linkedin_personal: (c) => createLinkedIn(c, "personal"),
  linkedin_company: (c) => createLinkedIn(c, "company"),
  instagram: (c) => createInstagram(c, "business"),
  instagram_personal: (c) => createInstagram(c, "personal"),
  facebook: (c) => createFacebook(c),
  threads: (c) => createThreads(c),
  tiktok: (c) => createTikTok(c),
  bluesky: (c) => createBluesky(c),
  mastodon: (c) => createMastodon(c),
  youtube: (c) => createYouTube(c),
  pinterest: (c) => createPinterest(c),
  google_business: (c) => createGoogleBusiness(c),
};

/**
 * Register a new-style PlatformModule factory. Use this when migrating a
 * platform from the legacy SocialProvider to the new architecture.
 */
export function registerPlatform(
  platformId: string,
  factory: PlatformFactory
): void {
  platformFactories[platformId] = factory;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Get a PlatformModule for the given platform ID.
 *
 * Checks new-style registrations first, then falls back to wrapping a legacy
 * SocialProvider via LegacyProviderAdapter.
 */
export function getPlatformModule(
  platformId: string,
  credentials: ProviderCredentials = {}
): PlatformModule {
  const factory = platformFactories[platformId];
  if (factory) return factory(credentials);

  // Fallback: wrap the legacy provider
  if (hasNativeProvider(platformId)) {
    return new LegacyProviderAdapter(
      platformId,
      getLegacyProvider(platformId, credentials)
    );
  }

  throw new Error(`No platform module registered for: ${platformId}`);
}

/**
 * Check whether a platform supports a given capability.
 */
export function hasCapability(
  platformId: string,
  capability: PlatformCapability,
  credentials: ProviderCredentials = {}
): boolean {
  try {
    const mod = getPlatformModule(platformId, credentials);
    return mod.capabilities.includes(capability);
  } catch {
    return false;
  }
}

/**
 * Check whether a platform has any registration (new or legacy).
 */
export function hasPlatform(platformId: string): boolean {
  return platformId in platformFactories || hasNativeProvider(platformId);
}

/**
 * List all registered platform IDs (excludes aliases like "x" for "twitter").
 */
export function listPlatformIds(): string[] {
  // Deduplicate aliases — keep canonical IDs only
  const canonical = new Set<string>();
  for (const [id, factory] of Object.entries(platformFactories)) {
    // Resolve the module to get its canonical id
    try {
      const mod = factory({});
      canonical.add(mod.id);
    } catch {
      canonical.add(id);
    }
  }
  return [...canonical];
}
