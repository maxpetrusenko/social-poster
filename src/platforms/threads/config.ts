import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "threads" as const,
  name: "Threads",
  slug: "threads",
  icon: "threads",
  color: "#000000",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics", "comments"] as PlatformCapability[],
  supportedPostTypes: ["text", "image", "video", "carousel"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "mp4", "mov"] as MediaType[],
  maxCaptionLength: 500,
  info: {
    description: "Publish text posts, images, videos, and carousels to Threads.",
    authTooltip: "OAuth 2.0 via Threads API. Requires threads_basic, threads_content_publish, threads_manage_insights, and threads_manage_replies scopes.",
    limitsTooltip: "250 API calls/user/hour, 1,000/user/day. 250 posts per 24 hours.",
    mediaTooltip: "JPEG, PNG, MP4, MOV. Images up to 8MB, videos up to 5 minutes.",
    analyticsTooltip: "Views, likes, replies, reposts, and follower demographics via Threads Insights API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "threads",
  label: "Threads",
  category: "social",
  summary: "Threads OAuth or managed relay.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "threads_oauth",
      label: "Connect with Threads (Direct)",
      provider: "direct",
      authType: "oauth",
      description: "Authorize through Threads OAuth for direct publishing.",
      recommendation: "Use for first-party Threads publishing.",
      infoTooltip: {
        title: "Threads API connection",
        bullets: [
          "Uses Meta's Threads API for direct text, media, and carousel publishing.",
          "Designed to become the reference for reply and insight support after X.",
          "Requires app review for deeper publishing and insights permissions.",
        ],
        learnMoreUrl: "https://developers.facebook.com/docs/threads",
      },
      fields: [],
      docs: [
        { label: "Threads API", url: "https://developers.facebook.com/docs/threads" },
        {
          label: "Threads app setup",
          url: "https://developers.facebook.com/docs/threads/get-started",
        },
      ],
    },
    relayMethod("Threads", "@maxpetrusenko"),
  ],
  oauthCallbackRules: { requireHttps: true, rewriteLocalhostTo127: true },
};

export const connectionDefinitions = [connectionDefinition];
