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

export const CONNECTION_PLATFORM_DEFINITIONS: ConnectionPlatformDefinition[] = [
  {
    type: "twitter",
    label: "Twitter/X",
    category: "social",
    summary: "Direct API app or Bird-based custom flow.",
    methods: [
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
        label: "Bird tool + custom instructions",
        provider: "bird",
        description:
          "Use the installed Bird CLI for browser-session posting or reply workflows.",
        recommendation:
          "Best when direct API is overkill or when you need local operator control.",
        fields: [
          textField("displayName", "Connection name", "X via Bird"),
          textField("handle", "Handle", "@maxpetrusenko"),
          toggleField(
            "useInstalledBirdSession",
            "Use installed Bird session",
            "Leave on to use the default local Firefox-backed Bird session."
          ),
          textField(
            "birdProfilePath",
            "Bird profile path",
            "/Users/maxpetrusenko/.../Firefox/Profile",
            "Optional custom Firefox profile path."
          ),
          passwordField(
            "accessToken",
            "Access token",
            "Optional if your Bird flow also uses app tokens"
          ),
          passwordField(
            "accessTokenSecret",
            "Access token secret",
            "Optional if your Bird flow also uses app tokens"
          ),
          textareaField(
            "customInstructions",
            "Bird instructions",
            "Example: use /Users/maxpetrusenko/Desktop/Projects/bird/bird and default Firefox session"
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
    summary: "OAuth app credentials for member or page posting.",
    methods: [
      {
        id: "linkedin_oauth",
        label: "LinkedIn OAuth app",
        provider: "direct",
        description:
          "For member authorization and page/company publishing with LinkedIn app credentials.",
        recommendation:
          "Preferred path for direct posting tied to the connected member/page.",
        fields: [
          textField("displayName", "Connection name", "LinkedIn Personal"),
          textField("handle", "Profile or page label", "Max Petrusenko"),
          passwordField("clientId", "Client ID", "Paste LinkedIn client ID"),
          passwordField(
            "clientSecret",
            "Client secret",
            "Paste LinkedIn client secret"
          ),
          passwordField(
            "refreshToken",
            "Refresh token",
            "Paste refresh token or long-lived access token"
          ),
          textField(
            "providerAccountId",
            "URN / account ID",
            "Optional page or member URN"
          ),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Scopes, page ownership notes, post format constraints"
          ),
        ],
        docs: [
          {
            label: "LinkedIn auth overview",
            url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
          },
        ],
      },
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
        label: "Meta app + token flow",
        provider: "direct",
        description:
          "Use a Meta app and account/page tokens for business or creator workflows.",
        recommendation:
          "Preferred when you want direct access instead of a relay provider.",
        fields: [
          textField("displayName", "Connection name", "Instagram Main"),
          textField("handle", "Handle", "@max.petrusenko"),
          passwordField("appId", "Meta app ID", "Paste app ID"),
          passwordField("clientSecret", "Meta app secret", "Paste app secret"),
          passwordField(
            "accessToken",
            "Access token",
            "Paste page or business access token"
          ),
          textField(
            "providerAccountId",
            "Instagram business ID",
            "Optional IG business account ID"
          ),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Business account notes, media limits, manual review rules"
          ),
        ],
        docs: [],
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
        docs: [],
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
        label: "Meta page token",
        provider: "direct",
        description:
          "Connect a Facebook page with Meta app credentials and page access tokens.",
        recommendation: "Use for direct page publishing and page-bound automations.",
        fields: [
          textField("displayName", "Connection name", "Facebook Page"),
          textField("handle", "Page label", "Max Petrusenko"),
          passwordField("appId", "Meta app ID", "Paste app ID"),
          passwordField("clientSecret", "Meta app secret", "Paste app secret"),
          passwordField(
            "accessToken",
            "Page access token",
            "Paste page access token"
          ),
          textField("providerAccountId", "Page ID", "Optional Facebook page ID"),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Page admin notes, posting restrictions, media caveats"
          ),
        ],
        docs: [],
      },
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
        label: "TikTok Content Posting API",
        provider: "direct",
        description:
          "Supports direct post or draft upload flows with a TikTok developer app.",
        recommendation:
          "Use for first-party posting or draft export from your app.",
        fields: [
          textField("displayName", "Connection name", "TikTok Main"),
          textField("handle", "Handle", "@max_petrusenko"),
          passwordField("clientId", "Client key", "Paste TikTok client key"),
          passwordField(
            "clientSecret",
            "Client secret",
            "Paste TikTok client secret"
          ),
          passwordField(
            "refreshToken",
            "Refresh token",
            "Paste TikTok refresh token"
          ),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Choose direct post vs upload draft, privacy defaults, creator notes"
          ),
        ],
        docs: [
          {
            label: "TikTok Content Posting API",
            url: "https://developers.tiktok.com/products/content-posting-api",
          },
        ],
      },
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
        label: "YouTube OAuth app",
        provider: "direct",
        description:
          "Use Google OAuth 2.0 for channel-level posting and management.",
        recommendation:
          "Use for direct channel actions. API keys alone are not enough for writes.",
        fields: [
          textField("displayName", "Connection name", "YouTube Channel"),
          textField("handle", "Channel label", "@maxpetrusenko"),
          passwordField("clientId", "Client ID", "Paste Google OAuth client ID"),
          passwordField(
            "clientSecret",
            "Client secret",
            "Paste Google OAuth client secret"
          ),
          passwordField(
            "refreshToken",
            "Refresh token",
            "Paste YouTube refresh token"
          ),
          textField("providerAccountId", "Channel ID", "Optional channel ID"),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Shorts-only, title template, privacy defaults, upload rules"
          ),
        ],
        docs: [
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
        label: "Custom OAuth setup",
        provider: "direct",
        description: "Use your own Pinterest app and token flow.",
        recommendation: "Use when Pinterest is a direct integration requirement.",
        fields: [
          textField("displayName", "Connection name", "Pinterest Main"),
          textField("handle", "Handle", "@m_petrusenko"),
          passwordField("clientId", "Client ID", "Paste Pinterest client ID"),
          passwordField("clientSecret", "Client secret", "Paste client secret"),
          passwordField("refreshToken", "Refresh token", "Paste refresh token"),
          textareaField(
            "customInstructions",
            "Operator instructions",
            "Board routing, media rules, approval notes"
          ),
        ],
        docs: [],
      },
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
