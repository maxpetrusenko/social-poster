import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";

export type ProviderEnvGroup = {
  label: string;
  keys: string[];
};

export type NativeConnectionAvailability = {
  configured: boolean;
  missing: string[];
};

type EnvSource = Record<string, string | undefined>;

const META_APP_ID_KEYS = [
  "META_APP_ID",
  "PLATFORM_FACEBOOK_APP_ID",
  "PLATFORM_INSTAGRAM_APP_ID",
];
const META_APP_SECRET_KEYS = [
  "META_APP_SECRET",
  "PLATFORM_FACEBOOK_APP_SECRET",
  "PLATFORM_INSTAGRAM_APP_SECRET",
];

const OAUTH_ENV_GROUPS: Partial<Record<PlatformType, ProviderEnvGroup[]>> = {
  twitter: [
    {
      label: "Twitter/X client ID",
      keys: [
        "SOCIAL_POSTER_TWITTER_CLIENT_ID",
        "NATIVE_TWITTER_CLIENT_ID",
        "TWITTER_CLIENT_ID",
        "X_CLIENT_ID",
        "PLATFORM_TWITTER_CLIENT_ID",
      ],
    },
    {
      label: "Twitter/X client secret",
      keys: [
        "SOCIAL_POSTER_TWITTER_CLIENT_SECRET",
        "NATIVE_TWITTER_CLIENT_SECRET",
        "TWITTER_CLIENT_SECRET",
        "X_CLIENT_SECRET",
        "PLATFORM_TWITTER_CLIENT_SECRET",
      ],
    },
  ],
  facebook: [
    { label: "Meta app ID", keys: META_APP_ID_KEYS },
    { label: "Meta app secret", keys: META_APP_SECRET_KEYS },
  ],
  instagram: [
    { label: "Meta app ID", keys: META_APP_ID_KEYS },
    { label: "Meta app secret", keys: META_APP_SECRET_KEYS },
  ],
  instagram_personal: [
    { label: "Meta app ID", keys: META_APP_ID_KEYS },
    { label: "Meta app secret", keys: META_APP_SECRET_KEYS },
  ],
  threads: [
    {
      label: "Threads app ID",
      keys: ["THREADS_APP_ID", "META_APP_ID", "PLATFORM_FACEBOOK_APP_ID"],
    },
    {
      label: "Threads app secret",
      keys: ["THREADS_APP_SECRET", "META_APP_SECRET", "PLATFORM_FACEBOOK_APP_SECRET"],
    },
  ],
  linkedin_personal: [
    {
      label: "LinkedIn client ID",
      keys: ["LINKEDIN_CLIENT_ID", "PLATFORM_LINKEDIN_CLIENT_ID"],
    },
    {
      label: "LinkedIn client secret",
      keys: ["LINKEDIN_CLIENT_SECRET", "PLATFORM_LINKEDIN_CLIENT_SECRET"],
    },
  ],
  linkedin_company: [
    {
      label: "LinkedIn client ID",
      keys: ["LINKEDIN_CLIENT_ID", "PLATFORM_LINKEDIN_CLIENT_ID"],
    },
    {
      label: "LinkedIn client secret",
      keys: ["LINKEDIN_CLIENT_SECRET", "PLATFORM_LINKEDIN_CLIENT_SECRET"],
    },
  ],
  tiktok: [
    {
      label: "TikTok client key",
      keys: [
        "TIKTOK_CLIENT_KEY_DEV",
        "PLATFORM_TIKTOK_CLIENT_KEY_DEV",
        "TIKTOK_CLIENT_KEY",
        "PLATFORM_TIKTOK_CLIENT_KEY",
      ],
    },
    {
      label: "TikTok client secret",
      keys: [
        "TIKTOK_CLIENT_SECRET_DEV",
        "PLATFORM_TIKTOK_CLIENT_SECRET_DEV",
        "TIKTOK_CLIENT_SECRET",
        "PLATFORM_TIKTOK_CLIENT_SECRET",
      ],
    },
  ],
  youtube: [
    {
      label: "YouTube client ID",
      keys: [
        "YOUTUBE_CLIENT_ID",
        "PLATFORM_GOOGLE_CLIENT_ID",
        "GOOGLE_AUTH_CLIENT_ID",
      ],
    },
    {
      label: "YouTube client secret",
      keys: [
        "YOUTUBE_CLIENT_SECRET",
        "PLATFORM_GOOGLE_CLIENT_SECRET",
        "GOOGLE_AUTH_CLIENT_SECRET",
      ],
    },
  ],
  pinterest: [
    {
      label: "Pinterest client ID",
      keys: ["PINTEREST_CLIENT_ID", "PLATFORM_PINTEREST_APP_ID"],
    },
    {
      label: "Pinterest client secret",
      keys: ["PINTEREST_CLIENT_SECRET", "PLATFORM_PINTEREST_APP_SECRET"],
    },
  ],
  google_business: [
    {
      label: "Google client ID",
      keys: [
        "GOOGLE_BUSINESS_CLIENT_ID",
        "PLATFORM_GOOGLE_CLIENT_ID",
        "GOOGLE_AUTH_CLIENT_ID",
      ],
    },
    {
      label: "Google client secret",
      keys: [
        "GOOGLE_BUSINESS_CLIENT_SECRET",
        "PLATFORM_GOOGLE_CLIENT_SECRET",
        "GOOGLE_AUTH_CLIENT_SECRET",
      ],
    },
  ],
};

export function getOAuthEnvGroups(platform: PlatformType) {
  return OAUTH_ENV_GROUPS[platform] ?? [];
}

export function getNativeConnectionAvailability(
  platform: PlatformType,
  env: EnvSource = process.env
): NativeConnectionAvailability {
  const missing = getOAuthEnvGroups(platform)
    .filter((group) => !group.keys.some((key) => hasEnvValue(env[key])))
    .map((group) => `${group.label}: ${group.keys.join(" or ")}`);

  return {
    configured: missing.length === 0,
    missing,
  };
}

export function getNativeConnectionAvailabilityByPlatform(
  env: EnvSource = process.env
): Record<PlatformType, NativeConnectionAvailability> {
  return Object.fromEntries(
    PLATFORM_TYPES.map((platform) => [
      platform,
      getNativeConnectionAvailability(platform, env),
    ])
  ) as Record<PlatformType, NativeConnectionAvailability>;
}

function hasEnvValue(value: string | undefined) {
  return typeof value === "string" && value.trim().length > 0;
}
