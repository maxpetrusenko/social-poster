import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  passwordField,
  relayMethod,
  textField,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "mastodon" as const,
  name: "Mastodon",
  slug: "mastodon",
  icon: "mastodon",
  color: "#6364FF",
  authType: "instance_oauth" as AuthType,
  tokenExpiry: false,
  capabilities: ["posting", "comments", "inbox"] as PlatformCapability[],
  futureCapabilities: ["engagement"] as PlatformCapability[],
  supportedPostTypes: ["text", "image", "video", "poll"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif", "mp4", "mov", "webp"] as MediaType[],
  maxCaptionLength: 500,
  info: {
    description: "Publish statuses with text, media, and polls to any Mastodon instance.",
    authTooltip: "Instance-level OAuth 2.0. App is registered per instance, then user authorizes. No token expiry.",
    limitsTooltip: "Varies by instance. Default: 300 statuses/3 hours on most instances.",
    mediaTooltip: "JPEG, PNG, GIF, WebP, MP4, MOV. Limits vary by instance (typically 10MB images, 40MB video).",
    analyticsTooltip: "Favourite and boost counts per status. No account-level analytics API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "mastodon",
  label: "Mastodon",
  category: "social",
  summary: "Per-instance OAuth app registration.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "mastodon_instance",
      label: "Mastodon instance token",
      provider: "direct",
      authType: "manual",
      description:
        "Use per-instance OAuth credentials or an existing access token.",
      recommendation:
        "Use once the target instance and app registration are known.",
      infoTooltip: {
        title: "Instance-scoped Mastodon",
        bullets: [
          "Every server has its own OAuth app registration and limits.",
          "Manual token setup is fastest until dynamic instance OAuth is built.",
          "Comments and boosts map cleanly to the future engagement module.",
        ],
        learnMoreUrl: "https://docs.joinmastodon.org/client/token/",
      },
      fields: [
        textField("displayName", "Connection name", "Mastodon Main"),
        textField("handle", "Handle", "@max@mastodon.social"),
        textField("instanceUrl", "Instance URL", "https://mastodon.social"),
        passwordField("clientId", "Client ID", "Paste client ID"),
        passwordField("clientSecret", "Client secret", "Paste client secret"),
        passwordField("accessToken", "Access token", "Paste access token"),
      ],
      docs: [
        {
          label: "Mastodon OAuth",
          url: "https://docs.joinmastodon.org/client/token/",
        },
      ],
    },
    relayMethod("Mastodon", "@max@mastodon.social"),
  ],
};

export const connectionDefinitions = [connectionDefinition];
