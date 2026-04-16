import type { PlatformType } from "./platforms";

export type ConnectionFieldType = "text" | "password" | "textarea" | "toggle";

export type ConnectionField = {
  id: string;
  label: string;
  type: ConnectionFieldType;
  placeholder?: string;
  help?: string;
};

export type ConnectionMethod = {
  id: string;
  label: string;
  provider: "direct" | "zernio" | "bird";
  authType?: "manual" | "oauth";
  description: string;
  recommendation: string;
  fields: ConnectionField[];
  docs: Array<{
    label: string;
    url: string;
  }>;
};

export type ConnectionPlatformDefinition = {
  type: PlatformType;
  label: string;
  category: "social" | "community" | "video";
  summary: string;
  methods: ConnectionMethod[];
};

function textField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "text", placeholder, help };
}

function passwordField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "password", placeholder, help };
}

function textareaField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "textarea", placeholder, help };
}

function toggleField(id: string, label: string, help?: string): ConnectionField {
  return { id, label, type: "toggle", help };
}

function relayMethod(platformLabel: string, handlePlaceholder: string): ConnectionMethod {
  return {
    id: `${platformLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_relay`,
    label: "Managed relay account",
    provider: "zernio",
    authType: "manual",
    description: `Use an existing relay/provider account ID for ${platformLabel}.`,
    recommendation: "Use when this account is already managed in Zernio/Late.",
    fields: [
      textField("displayName", "Connection name", `${platformLabel} Relay`),
      textField("handle", "Handle or label", handlePlaceholder),
      textField("providerAccountId", "Provider account ID", "69024a..."),
      textareaField(
        "customInstructions",
        "Relay notes",
        "Publishing caveats, media handling notes, escalation rules"
      ),
    ],
    docs: [],
  };
}

export const CONNECTION_PLATFORM_DEFINITIONS: ConnectionPlatformDefinition[] = [
  {
    type: "twitter",
    label: "Twitter/X",
    category: "social",
    summary: "Direct API app or Bird-based custom flow.",
    methods: [
      {
        id: "x_oauth",
        label: "Connect with X (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through X OAuth 2.0 and store the returned user token for native posting.",
        recommendation:
          "Use when the X developer app credentials are configured and you want account-bound OAuth.",
        fields: [],
        docs: [
          {
            label: "X developer apps",
            url: "https://docs.x.com/fundamentals/developer-apps",
          },
          {
            label: "X developer portal",
            url: "https://developer.x.com/en/portal/dashboard",
          },
          {
            label: "X OAuth overview",
            url: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
          },
          {
            label: "X OAuth 2.0 user context",
            url: "https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token",
          },
        ],
      },
      {
        id: "x_api",
        label: "X API keys + user tokens",
        provider: "direct",
        description:
          "Best when you want direct publish control and you have an approved X developer app.",
        recommendation:
          "Use for direct publishing and account-bound posting workflows.",
        fields: [
          textField("displayName", "Connection name", "X Main"),
          textField("handle", "Handle", "@maxpetrusenko"),
          passwordField("apiKey", "API key", "Paste API key"),
          passwordField("apiSecret", "API key secret", "Paste API key secret"),
          passwordField("accessToken", "Access token", "Paste user access token"),
          passwordField(
            "accessTokenSecret",
            "Access token secret",
            "Paste user access token secret"
          ),
          passwordField(
            "bearerToken",
            "Bearer token",
            "Optional for app-only read access"
          ),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Any posting constraints, fallback rules, or account caveats"
          ),
        ],
        docs: [
          {
            label: "X developer apps",
            url: "https://docs.x.com/fundamentals/developer-apps",
          },
          {
            label: "X developer portal",
            url: "https://developer.x.com/en/portal/dashboard",
          },
          {
            label: "X OAuth overview",
            url: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
          },
          {
            label: "X authentication options",
            url: "https://docs.x.com/xdks/python/authentication",
          },
        ],
      },
      {
        id: "bird_cli",
        label: "Bird session or cookie tokens",
        provider: "bird",
        description:
          "Use Bird for real X posting with browser session cookies locally or explicit auth tokens in the container.",
        recommendation:
          "Best when you want native X posting, long-post threading, and a local-to-prod fallback path.",
        fields: [
          textField("displayName", "Connection name", "X via Bird"),
          textField("handle", "Handle", "@maxpetrusenko"),
          toggleField(
            "useInstalledBirdSession",
            "Use installed Bird session",
            "Use browser cookies from the local machine when explicit auth tokens are not provided."
          ),
          textField(
            "chromeProfile",
            "Chrome profile name",
            "Default",
            "Optional. Example: Default or Profile 1."
          ),
          textField(
            "chromeProfileDir",
            "Chrome profile dir",
            "/Users/maxpetrusenko/.../Chrome/Profile",
            "Optional explicit Chrome profile path."
          ),
          textField(
            "firefoxProfile",
            "Firefox profile name",
            "default-release",
            "Optional. Use if Bird should read Firefox cookies instead."
          ),
          passwordField(
            "authToken",
            "auth_token cookie",
            "Optional explicit X auth_token for container/runtime use"
          ),
          passwordField(
            "ct0",
            "ct0 cookie",
            "Optional explicit X ct0 for container/runtime use"
          ),
          toggleField(
            "threadLongPosts",
            "Thread long posts",
            "Automatically split long X posts into a thread."
          ),
          textField(
            "threadChunkLimit",
            "Thread chunk limit",
            "260",
            "Keep under the X limit after thread numbering."
          ),
          textareaField(
            "customInstructions",
            "Bird instructions",
            "Example: prefer Chrome default profile locally, env cookies in container, thread long posts"
          ),
        ],
        docs: [
          {
            label: "Bird tool notes",
            url: "https://github.com/maxpetrusenko",
          },
        ],
      },
      {
        id: "x_via_relay",
        label: "Managed relay account",
        provider: "zernio",
        description:
          "Use an external relay/provider account ID when publishing is delegated outside this app.",
        recommendation: "Use when this account is already managed in Zernio/Late.",
        fields: [
          textField("displayName", "Connection name", "X Relay"),
          textField("handle", "Handle", "@maxpetrusenko"),
          textField("providerAccountId", "Provider account ID", "690248..."),
          textareaField(
            "customInstructions",
            "Relay notes",
            "Any routing notes, throttling caveats, or operator warnings"
          ),
        ],
        docs: [],
      },
    ],
  },
  {
    type: "linkedin",
    label: "LinkedIn",
    category: "social",
    summary: "Late-managed LinkedIn account proxy.",
    methods: [
      relayMethod("LinkedIn", "Max Petrusenko"),
    ],
  },
  {
    type: "linkedin_personal",
    label: "LinkedIn Profile",
    category: "social",
    summary: "Member profile connection.",
    methods: [
      {
        id: "linkedin_personal_oauth",
        label: "Connect with LinkedIn (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through LinkedIn OAuth and store the member or page token for direct publishing.",
        recommendation:
          "Preferred path for direct posting tied to the connected member/page.",
        fields: [],
        docs: [
          {
            label: "LinkedIn developer apps",
            url: "https://www.linkedin.com/developers/apps",
          },
          {
            label: "LinkedIn auth overview",
            url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
          },
        ],
      },
      relayMethod("LinkedIn Personal", "Max Petrusenko"),
    ],
  },
  {
    type: "linkedin_company",
    label: "LinkedIn Page",
    category: "social",
    summary: "Company page connection.",
    methods: [
      {
        id: "linkedin_company_oauth",
        label: "Connect LinkedIn Company (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through LinkedIn OAuth for company/page publishing.",
        recommendation:
          "Use for direct company posting when Community Management API is approved.",
        fields: [],
        docs: [
          {
            label: "LinkedIn developer apps",
            url: "https://www.linkedin.com/developers/apps",
          },
          {
            label: "LinkedIn auth overview",
            url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
          },
        ],
      },
      relayMethod("LinkedIn Company", "Company Page"),
    ],
  },
  {
    type: "instagram",
    label: "Instagram",
    category: "social",
    summary: "Meta OAuth or managed relay.",
    methods: [
      {
        id: "meta_oauth",
        label: "Connect with Meta (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through Meta OAuth for Instagram business or creator publishing.",
        recommendation:
          "Preferred when you want direct access instead of a relay provider.",
        fields: [],
        docs: [
          {
            label: "Create a Meta app",
            url: "https://developers.facebook.com/docs/development/create-an-app/",
          },
          {
            label: "Instagram Graph API setup",
            url: "https://developers.facebook.com/docs/instagram-api/getting-started/",
          },
        ],
      },
      {
        id: "instagram_relay",
        label: "Managed relay account",
        provider: "zernio",
        description: "Use an existing relay/provider account ID.",
        recommendation: "Use when Instagram is already managed externally.",
        fields: [
          textField("displayName", "Connection name", "Instagram Relay"),
          textField("handle", "Handle", "@max.petrusenko"),
          textField("providerAccountId", "Provider account ID", "69024a..."),
          textareaField(
            "customInstructions",
            "Relay notes",
            "Publishing caveats, media handling notes, escalation rules"
          ),
        ],
        docs: [
          {
            label: "Create a Meta app",
            url: "https://developers.facebook.com/docs/development/create-an-app/",
          },
          {
            label: "Facebook Login setup",
            url: "https://developers.facebook.com/docs/facebook-login/",
          },
        ],
      },
    ],
  },
  {
    type: "facebook",
    label: "Facebook",
    category: "social",
    summary: "Meta page connection or managed relay.",
    methods: [
      {
        id: "facebook_meta",
        label: "Connect with Meta (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through Meta OAuth and store a token for direct page publishing.",
        recommendation: "Use for direct page publishing and page-bound automations.",
        fields: [],
        docs: [],
      },
      relayMethod("Facebook", "Max Petrusenko"),
    ],
  },
  {
    type: "tiktok",
    label: "TikTok",
    category: "video",
    summary: "Content Posting API via OAuth app.",
    methods: [
      {
        id: "tiktok_oauth",
        label: "Connect with TikTok (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Supports direct post or draft upload flows with a TikTok developer app.",
        recommendation:
          "Use for first-party posting or draft export from your app.",
        fields: [],
        docs: [
          {
            label: "TikTok app setup",
            url: "https://developers.tiktok.com/doc/login-kit-web/",
          },
          {
            label: "TikTok Content Posting API",
            url: "https://developers.tiktok.com/products/content-posting-api",
          },
        ],
      },
      relayMethod("TikTok", "@max_petrusenko"),
    ],
  },
  {
    type: "youtube",
    label: "YouTube",
    category: "video",
    summary: "Google OAuth app for channel posting and video management.",
    methods: [
      {
        id: "youtube_oauth",
        label: "Connect with Google (Direct)",
        provider: "direct",
        authType: "oauth",
        description:
          "Use Google OAuth 2.0 for channel-level posting and management.",
        recommendation:
          "Use for direct channel actions. API keys alone are not enough for writes.",
        fields: [],
        docs: [
          {
            label: "Google credentials console",
            url: "https://console.cloud.google.com/apis/credentials",
          },
          {
            label: "YouTube auth guide",
            url: "https://developers.google.com/youtube/v3/guides/authentication",
          },
          {
            label: "YouTube credential setup",
            url: "https://developers.google.com/youtube/registering_an_application",
          },
        ],
      },
      relayMethod("YouTube", "@maxpetrusenko"),
    ],
  },
  {
    type: "pinterest",
    label: "Pinterest",
    category: "social",
    summary: "Custom OAuth or relay-managed account.",
    methods: [
      {
        id: "pinterest_custom",
        label: "Connect with Pinterest (Direct)",
        provider: "direct",
        authType: "oauth",
        description: "Use your own Pinterest app and token flow.",
        recommendation: "Use when Pinterest is a direct integration requirement.",
        fields: [],
        docs: [
          {
            label: "Pinterest app dashboard",
            url: "https://developers.pinterest.com/apps/",
          },
          {
            label: "Pinterest OAuth",
            url: "https://developers.pinterest.com/docs/getting-started/authentication/",
          },
        ],
      },
      relayMethod("Pinterest", "@m_petrusenko"),
    ],
  },
  {
    type: "threads",
    label: "Threads",
    category: "social",
    summary: "Threads OAuth or managed relay.",
    methods: [
      {
        id: "threads_oauth",
        label: "Connect with Threads (Direct)",
        provider: "direct",
        authType: "oauth",
        description: "Authorize through Threads OAuth for direct publishing.",
        recommendation: "Use for first-party Threads publishing.",
        fields: [],
        docs: [
          {
            label: "Threads API",
            url: "https://developers.facebook.com/docs/threads",
          },
          {
            label: "Threads app setup",
            url: "https://developers.facebook.com/docs/threads/get-started",
          },
        ],
      },
      relayMethod("Threads", "@maxpetrusenko"),
    ],
  },
  {
    type: "bluesky",
    label: "Bluesky",
    category: "social",
    summary: "AT Protocol session using handle and app password.",
    methods: [
      {
        id: "bluesky_session",
        label: "Bluesky app password",
        provider: "direct",
        authType: "manual",
        description: "Use a handle and Bluesky app password for direct AT Protocol publishing.",
        recommendation: "Use for direct Bluesky posting without a developer app.",
        fields: [
          textField("displayName", "Connection name", "Bluesky Main"),
          textField("handle", "Handle", "maxpetrusenko.bsky.social"),
          passwordField("appPassword", "App password", "Paste Bluesky app password"),
          textField("pdsUrl", "PDS URL", "https://bsky.social", "Optional. Leave default for Bluesky-hosted accounts."),
        ],
        docs: [{ label: "Bluesky app passwords", url: "https://bsky.app/settings/app-passwords" }],
      },
      relayMethod("Bluesky", "maxpetrusenko.bsky.social"),
    ],
  },
  {
    type: "google_business",
    label: "Google Business",
    category: "social",
    summary: "Google OAuth for Business Profile locations.",
    methods: [
      {
        id: "google_business_oauth",
        label: "Connect with Google (Direct)",
        provider: "direct",
        authType: "oauth",
        description: "Authorize through Google OAuth for Business Profile posting.",
        recommendation: "Use for direct location updates.",
        fields: [],
        docs: [
          {
            label: "Google credentials console",
            url: "https://console.cloud.google.com/apis/credentials",
          },
          {
            label: "Business Profile APIs",
            url: "https://developers.google.com/my-business",
          },
          {
            label: "Business Profile setup",
            url: "https://developers.google.com/my-business/content/basic-setup",
          },
        ],
      },
      relayMethod("Google Business", "Business location"),
    ],
  },
  {
    type: "mastodon",
    label: "Mastodon",
    category: "social",
    summary: "Per-instance OAuth app registration.",
    methods: [
      {
        id: "mastodon_instance",
        label: "Mastodon instance token",
        provider: "direct",
        authType: "manual",
        description: "Use per-instance OAuth credentials or an existing access token.",
        recommendation: "Use once the target instance and app registration are known.",
        fields: [
          textField("displayName", "Connection name", "Mastodon Main"),
          textField("handle", "Handle", "@max@mastodon.social"),
          textField("instanceUrl", "Instance URL", "https://mastodon.social"),
          passwordField("clientId", "Client ID", "Paste client ID"),
          passwordField("clientSecret", "Client secret", "Paste client secret"),
          passwordField("accessToken", "Access token", "Paste access token"),
        ],
        docs: [{ label: "Mastodon OAuth", url: "https://docs.joinmastodon.org/client/token/" }],
      },
      relayMethod("Mastodon", "@max@mastodon.social"),
    ],
  },
  {
    type: "instagram_personal",
    label: "Instagram Personal",
    category: "social",
    summary: "Instagram direct OAuth for personal or creator workflows.",
    methods: [
      {
        id: "instagram_personal_oauth",
        label: "Connect with Instagram (Direct)",
        provider: "direct",
        authType: "oauth",
        description: "Authorize through Instagram OAuth for the personal API path.",
        recommendation: "Use when this account cannot use the Instagram Graph business path.",
        fields: [],
        docs: [
          {
            label: "Create a Meta app",
            url: "https://developers.facebook.com/docs/development/create-an-app/",
          },
          {
            label: "Instagram Platform",
            url: "https://developers.facebook.com/docs/instagram-platform",
          },
        ],
      },
      relayMethod("Instagram Personal", "@max.petrusenko"),
    ],
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    category: "community",
    summary: "WhatsApp Business messaging through Late proxy.",
    methods: [
      relayMethod("WhatsApp", "+1 555 0100"),
    ],
  },
  {
    type: "reddit",
    label: "Reddit",
    category: "community",
    summary: "OAuth app or custom workflow depending on subreddit access.",
    methods: [
      {
        id: "reddit_custom",
        label: "Reddit app credentials",
        provider: "direct",
        description:
          "Use for subreddit-specific posting where you control the app and account.",
        recommendation:
          "Use for controlled Reddit workflows and subreddit-bound publishing.",
        fields: [
          textField("displayName", "Connection name", "Reddit Main"),
          textField("handle", "Username or subreddit", "u/max or r/yourcommunity"),
          passwordField("clientId", "Client ID", "Paste Reddit app client ID"),
          passwordField("clientSecret", "Client secret", "Paste Reddit client secret"),
          passwordField(
            "refreshToken",
            "Refresh token",
            "Paste Reddit refresh token"
          ),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Subreddit rules, flair requirements, anti-spam notes"
          ),
        ],
        docs: [
          {
            label: "Reddit app preferences",
            url: "https://www.reddit.com/prefs/apps",
          },
          {
            label: "Reddit API docs",
            url: "https://www.reddit.com/dev/api/",
          },
        ],
      },
    ],
  },
];

export function getConnectionPlatformDefinition(type: PlatformType) {
  return CONNECTION_PLATFORM_DEFINITIONS.find((item) => item.type === type);
}
