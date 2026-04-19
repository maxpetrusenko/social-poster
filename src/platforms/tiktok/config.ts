import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "tiktok" as const,
  name: "TikTok",
  slug: "tiktok",
  icon: "tiktok",
  color: "#000000",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics", "comments"] as PlatformCapability[],
  supportedPostTypes: ["video"] as PostType[],
  supportedMediaTypes: ["mp4", "mov"] as MediaType[],
  maxCaptionLength: 2200,
  info: {
    description: "Upload and publish videos to TikTok.",
    authTooltip: "OAuth 2.0 with PKCE. Requires user.info.basic, video.upload, and video.publish scopes.",
    limitsTooltip: "Privacy level must be set per video. Content Posting API has daily quotas that vary by app status.",
    mediaTooltip: "MP4, MOV up to 4GB. Video is uploaded in chunks, then published asynchronously.",
    analyticsTooltip: "Video views, likes, comments, shares, and average watch time via TikTok Research API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "tiktok",
  label: "TikTok",
  category: "video",
  summary: "Content Posting API via OAuth app.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
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
      infoTooltip: {
        title: "TikTok content posting",
        bullets: [
          "Uses TikTok Login Kit plus Content Posting API permissions.",
          "Supports upload/init flows that may publish directly or create a draft.",
          "Analytics and comments are platform-expansion work after the X pattern lands.",
        ],
        learnMoreUrl: "https://developers.tiktok.com/products/content-posting-api",
      },
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
  oauthCallbackRules: { requireHttps: true, noLoopback: true },
};

export const connectionDefinitions = [connectionDefinition];
