import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  passwordField,
  textField,
  textareaField,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "twitter" as const,
  name: "Twitter / X",
  slug: "x",
  icon: "x",
  color: "#000000",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting", "comments", "inbox"] as PlatformCapability[],
  futureCapabilities: ["analytics", "engagement"] as PlatformCapability[],
  supportedPostTypes: ["text"] as PostType[],
  supportedMediaTypes: [] as MediaType[],
  maxCaptionLength: 280,
  info: {
    description: "Post tweets and threads to Twitter / X.",
    authTooltip: "OAuth 2.0 with PKCE. Requires tweet.read, tweet.write, users.read, dm.read, dm.write, offline.access scopes.",
    limitsTooltip: "300 tweets/day, 2,400 API requests/day. Rate limits reset hourly.",
    mediaTooltip: "Text-only posting via native OAuth. Media uploads require elevated API access.",
    analyticsTooltip: "Post impressions, likes, retweets, replies, and profile visits (coming soon).",
  },
} as const;

const xDocs = [
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
];

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "twitter",
  label: "Twitter/X",
  category: "social",
  summary: "Direct API app or Bird session.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "x_oauth",
      label: "Connect with X (Direct)",
      provider: "direct",
      authType: "oauth",
      description:
        "Authorize through X OAuth 2.0 and store the returned user token for native posting.",
      recommendation:
        "Use when X developer app credentials are configured and you want account-bound OAuth.",
      infoTooltip: {
        title: "Native X OAuth",
        bullets: [
          "Best long-term path for account-bound posting and future analytics.",
          "Requires callback URL and app credentials from the X developer portal.",
          "Supports inbound mentions, replies, and DMs when the app has the matching X permissions.",
        ],
        learnMoreUrl: "https://docs.x.com/fundamentals/authentication/oauth-2-0/overview",
      },
      fields: [],
      docs: [
        ...xDocs,
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
      authType: "manual",
      description:
        "Best when you want direct publish control and you have an approved X developer app.",
      recommendation:
        "Use for direct publishing and account-bound posting workflows.",
      infoTooltip: {
        title: "Manual X credentials",
        bullets: [
          "Uses explicit app and user tokens instead of the OAuth connect button.",
          "Useful for server-side jobs, fallback publishing, and local testing.",
          "Keep tokens in encrypted storage or env, never in public docs.",
        ],
      },
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
        passwordField("bearerToken", "Bearer token", "Optional for app-only read access"),
        textareaField(
          "customInstructions",
          "Operator instructions",
          "Any posting constraints, fallback rules, or account caveats"
        ),
      ],
      docs: [
        ...xDocs,
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
      authType: "manual",
      description:
        "Use Bird for real X posting with browser session cookies locally or explicit auth tokens in the container.",
      recommendation:
        "Step 1: Log in to https://x.com in Chrome. Step 2: Paste this into Claude Code or Codex: Use browser-tools, Chrome DevTools, or the local Chrome cookie store to get my x.com cookies from this computer. Get only auth_token and ct0. Do not print them in chat. Paste auth_token into X_AUTH_TOKEN and ct0 into X_CT0 on this Social Poster page, save, then click Test connection.",
      infoTooltip: {
        title: "Bird-powered X posting",
        bullets: [
          "Uses the local Bird CLI and browser/cookie session instead of official OAuth.",
          "Good fallback for posting, outreach replies, inbound mentions, search, and reading threads.",
          "Bird does not expose DMs in the current CLI, so DM inbox uses direct X OAuth.",
        ],
      },
      fields: [
        passwordField(
          "X_AUTH_TOKEN",
          "X_AUTH_TOKEN",
          "Paste X auth_token cookie",
          "Fast path: ask Claude Code or Codex to run the agent prompt below. Manual path: Chrome DevTools > Application > Cookies > https://x.com > copy auth_token."
        ),
        passwordField(
          "X_CT0",
          "X_CT0",
          "Paste X ct0 cookie",
          "Fast path: ask Claude Code or Codex to run the agent prompt below. Manual path: copy ct0 from the same x.com cookies table."
        ),
      ],
      docs: [
        {
          label: "Bird mirror",
          url: "https://github.com/maxpetrusenko/steipete-bird",
        },
        {
          label: "Chrome cookie guide",
          url: "https://developer.chrome.com/docs/devtools/application/cookies/",
        },
      ],
    },
  ],
};

export const connectionDefinitions = [connectionDefinition];
