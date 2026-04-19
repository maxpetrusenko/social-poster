import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "pinterest" as const,
  name: "Pinterest",
  slug: "pinterest",
  icon: "pinterest",
  color: "#E60023",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics"] as PlatformCapability[],
  supportedPostTypes: ["pin"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif", "mp4"] as MediaType[],
  maxCaptionLength: 500,
  info: {
    description: "Create Pins with images and videos to Pinterest boards.",
    authTooltip: "OAuth 2.0. Requires user_accounts:read, boards:read, pins:read, and pins:write scopes. Select a board after connecting.",
    limitsTooltip: "1,000 API requests/hour, 24,000/day. 25 pins/day recommended.",
    mediaTooltip: "JPEG, PNG, GIF up to 32MB. Video Pins via MP4 up to 2GB.",
    analyticsTooltip: "Pin impressions, saves, outbound clicks, and engagement rate via Pinterest Analytics API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "pinterest",
  label: "Pinterest",
  category: "social",
  summary: "Custom OAuth or relay-managed account.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "pinterest_custom",
      label: "Connect with Pinterest (Direct)",
      provider: "direct",
      authType: "oauth",
      description: "Use your own Pinterest app and token flow.",
      recommendation: "Use when Pinterest is a direct integration requirement.",
      infoTooltip: {
        title: "Pinterest OAuth",
        bullets: [
          "Connects a Pinterest business account through an app-owned OAuth flow.",
          "Pins require board selection and media upload constraints.",
          "Future analytics can use Pinterest pin and account metrics.",
        ],
        learnMoreUrl: "https://developers.pinterest.com/docs/getting-started/authentication/",
      },
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
};

export const connectionDefinitions = [connectionDefinition];
