import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  passwordField,
  relayMethod,
  textField,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "bluesky" as const,
  name: "Bluesky",
  slug: "bluesky",
  icon: "bluesky",
  color: "#0085FF",
  authType: "session" as AuthType,
  tokenExpiry: false,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["engagement", "comments"] as PlatformCapability[],
  supportedPostTypes: ["text", "image"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif"] as MediaType[],
  maxCaptionLength: 300,
  info: {
    description: "Post text and images to Bluesky via the AT Protocol.",
    authTooltip: "Authenticates with an App Password (not your main password). No token expiry.",
    limitsTooltip: "Rate limits enforced by PDS. Typically 5,000 requests/hour for createRecord.",
    mediaTooltip: "JPEG, PNG, GIF up to 1MB per image, max 4 images per post.",
    analyticsTooltip: "Limited analytics. Like and repost counts available per post (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "bluesky",
  label: "Bluesky",
  category: "social",
  summary: "AT Protocol session using handle and app password.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "bluesky_session",
      label: "Bluesky app password",
      provider: "direct",
      authType: "manual",
      description:
        "Use a handle and Bluesky app password for direct AT Protocol publishing.",
      recommendation: "Use for direct Bluesky posting without a developer app.",
      infoTooltip: {
        title: "AT Protocol session",
        bullets: [
          "Uses a Bluesky app password, not the main account password.",
          "No OAuth app setup is needed for the current direct posting path.",
          "Engagement and thread reading can build on AT Protocol records later.",
        ],
        learnMoreUrl: "https://bsky.app/settings/app-passwords",
      },
      fields: [
        textField("displayName", "Connection name", "Bluesky Main"),
        textField("handle", "Handle", "maxpetrusenko.bsky.social"),
        passwordField("appPassword", "App password", "Paste Bluesky app password"),
        textField(
          "pdsUrl",
          "PDS URL",
          "https://bsky.social",
          "Optional. Leave default for Bluesky-hosted accounts."
        ),
      ],
      docs: [
        {
          label: "Bluesky app passwords",
          url: "https://bsky.app/settings/app-passwords",
        },
      ],
    },
    relayMethod("Bluesky", "maxpetrusenko.bsky.social"),
  ],
};

export const connectionDefinitions = [connectionDefinition];
