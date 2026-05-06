import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "instagram" as const,
  name: "Instagram",
  slug: "instagram",
  icon: "instagram",
  color: "#E4405F",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting", "comments", "inbox"] as PlatformCapability[],
  futureCapabilities: ["analytics"] as PlatformCapability[],
  supportedPostTypes: ["image", "carousel", "reel", "story"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif", "mp4", "mov"] as MediaType[],
  maxCaptionLength: 2200,
  variants: ["instagram", "instagram_personal"] as const,
  info: {
    description: "Publish images, carousels, reels, and stories to Instagram professional accounts.",
    authTooltip: "OAuth 2.0 via Instagram Login and the Instagram Platform app credentials.",
    limitsTooltip: "25 media containers/day per account. Carousel items count toward the limit.",
    mediaTooltip: "JPEG, PNG, GIF, MP4, MOV. Images max 8MB, videos max 100MB and 60 seconds (reels up to 15 minutes).",
    analyticsTooltip: "Reach, impressions, saves, and profile activity via Instagram Insights API (coming soon).",
  },
} as const;

const metaDocs = [
  {
    label: "Create a Meta app",
    url: "https://developers.facebook.com/docs/development/create-an-app/",
  },
  {
    label: "Instagram API with Instagram Login",
    url: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/",
  },
  {
    label: "Basic Display API shutdown",
    url: "https://developers.facebook.com/blog/post/2024/09/04/update-on-instagram-basic-display-api/",
  },
];

const instagramRelayMethod = {
  ...relayMethod("Instagram", "@max.petrusenko"),
  description:
    "Use managed relay/manual handling for default personal accounts or accounts already connected upstream.",
  recommendation:
    "Use this when the account is not Business or Creator, or when direct Meta OAuth is not needed.",
  infoTooltip: {
    title: "Instagram relay",
    bullets: [
      "Avoids Meta's professional-account OAuth requirement for local account setup.",
      "Stores an external provider account ID instead of Instagram OAuth tokens.",
      "Publishing depth depends on the upstream relay account.",
    ],
  },
};

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "instagram",
  label: "Instagram",
  category: "social",
  summary: "Professional OAuth or managed relay.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "instagram_oauth",
      label: "Connect professional Instagram",
      provider: "direct",
      authType: "oauth",
      description:
        "Authorize through Instagram Login for Business or Creator account publishing.",
      recommendation:
        "Use for Business or Creator accounts. Default personal accounts must use relay/manual handling.",
      infoTooltip: {
        title: "Professional Instagram OAuth",
        bullets: [
          "Meta only grants these publishing scopes to Business or Creator accounts.",
          "Default personal accounts are rejected by Instagram before our callback receives a code.",
          "Supports the publishing container flow used for posts, reels, and carousels.",
        ],
        learnMoreUrl: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/",
      },
      fields: [],
      docs: metaDocs,
    },
    instagramRelayMethod,
  ],
};

export const connectionDefinitions = [connectionDefinition];
