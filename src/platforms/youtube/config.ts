import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "youtube" as const,
  name: "YouTube",
  slug: "youtube",
  icon: "youtube",
  color: "#FF0000",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics", "comments"] as PlatformCapability[],
  supportedPostTypes: ["video", "short"] as PostType[],
  supportedMediaTypes: ["mp4", "mov"] as MediaType[],
  maxCaptionLength: 5000,
  info: {
    description: "Upload videos and Shorts to YouTube channels.",
    authTooltip: "Google OAuth 2.0. Requires youtube.upload, youtube.readonly, and youtube.force-ssl scopes.",
    limitsTooltip: "10,000 quota units/day. Video uploads cost 1,600 units each.",
    mediaTooltip: "MP4, MOV. Max 256GB or 12 hours. Shorts must be under 60 seconds and vertical format.",
    analyticsTooltip: "Views, watch time, subscribers gained, impressions via YouTube Analytics API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "youtube",
  label: "YouTube",
  category: "video",
  summary: "Google OAuth app for channel posting and video management.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
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
      infoTooltip: {
        title: "YouTube channel OAuth",
        bullets: [
          "Connects a channel through Google OAuth for upload and management scopes.",
          "Video uploads consume quota and need resumable upload handling.",
          "Analytics and comment moderation fit the future platform-depth modules.",
        ],
        learnMoreUrl: "https://developers.google.com/youtube/v3/guides/authentication",
      },
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
};

export const connectionDefinitions = [connectionDefinition];
