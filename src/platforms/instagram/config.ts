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
    description: "Publish images, carousels, reels, and stories to Instagram business and personal accounts.",
    authTooltip: "OAuth 2.0 via Facebook Graph API. Business accounts require a linked Facebook Page. Personal accounts use the Instagram Basic Display API.",
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
    label: "Instagram Graph API setup",
    url: "https://developers.facebook.com/docs/instagram-api/getting-started/",
  },
];

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "instagram",
  label: "Instagram",
  category: "social",
  summary: "Meta OAuth or managed relay.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
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
      infoTooltip: {
        title: "Instagram Graph connection",
        bullets: [
          "Designed for Business or Creator accounts connected to a Facebook Page.",
          "Supports the publishing container flow used for posts, reels, and carousels.",
          "Future modules add insights, comments, and inbox where Meta permissions allow.",
        ],
        learnMoreUrl: "https://developers.facebook.com/docs/instagram-api/getting-started/",
      },
      fields: [],
      docs: metaDocs,
    },
    relayMethod("Instagram", "@max.petrusenko"),
  ],
};

export const connectionDefinitionPersonal: ConnectionPlatformDefinition = {
  type: "instagram_personal",
  label: "Instagram Personal",
  category: "social",
  summary: "Instagram direct OAuth for personal or creator workflows.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "instagram_personal_oauth",
      label: "Connect with Instagram (Direct)",
      provider: "direct",
      authType: "oauth",
      description: "Authorize through Instagram OAuth for the personal API path.",
      recommendation:
        "Use when this account cannot use the Instagram Graph business path.",
      infoTooltip: {
        title: "Instagram personal OAuth",
        bullets: [
          "Keeps the personal account path separate from Business Graph setup.",
          "Uses Instagram Business Login for Professional accounts without the Facebook Page picker.",
          "Publishing depends on Meta access level for the connected Instagram account.",
        ],
        learnMoreUrl: "https://developers.facebook.com/docs/instagram-platform",
      },
      fields: [],
      docs: [
        metaDocs[0],
        {
          label: "Instagram Platform",
          url: "https://developers.facebook.com/docs/instagram-platform",
        },
      ],
    },
    relayMethod("Instagram Personal", "@max.petrusenko"),
  ],
};

export const connectionDefinitions = [
  connectionDefinition,
  connectionDefinitionPersonal,
];
