import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "facebook" as const,
  name: "Facebook",
  slug: "facebook",
  icon: "facebook",
  color: "#1877F2",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting", "comments", "inbox"] as PlatformCapability[],
  futureCapabilities: ["analytics"] as PlatformCapability[],
  supportedPostTypes: ["text", "image", "video", "link"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif", "mp4", "mov"] as MediaType[],
  maxCaptionLength: 63_206,
  info: {
    description: "Post text, photos, videos, and links to Facebook Pages.",
    authTooltip: "OAuth 2.0. Requires pages_manage_posts and pages_read_engagement scopes. Select a Page after connecting.",
    limitsTooltip: "200 posts/hour per Page. Feed rate limits apply for high-frequency posting.",
    mediaTooltip: "Photos (JPEG, PNG, GIF up to 10MB) and videos (MP4, MOV up to 10GB).",
    analyticsTooltip: "Page impressions, reach, engagement, and post-level metrics via Graph API Insights (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "facebook",
  label: "Facebook",
  category: "social",
  summary: "Meta page connection or managed relay.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "facebook_meta",
      label: "Connect Facebook Page",
      provider: "direct",
      authType: "oauth",
      description:
        "Authorize through Facebook Login and store Page access tokens for direct publishing.",
      recommendation: "Use for direct page publishing and page-bound automations.",
      infoTooltip: {
        title: "Facebook Page OAuth",
        bullets: [
          "Requests only the Page list, read engagement, and publish permissions needed for posting.",
          "Saves each returned Facebook Page as its own connection with a Page access token.",
          "Comments and inbox permissions should be added only after Meta app review approves them.",
        ],
        learnMoreUrl: "https://developers.facebook.com/docs/pages-api/",
      },
      fields: [],
      docs: [
        {
          label: "Create a Meta app",
          url: "https://developers.facebook.com/docs/development/create-an-app/",
        },
        {
          label: "Facebook Login setup",
          url: "https://developers.facebook.com/docs/facebook-login/",
        },
      ],
    },
    relayMethod("Facebook", "Max Petrusenko"),
  ],
};

export const connectionDefinitions = [connectionDefinition];
