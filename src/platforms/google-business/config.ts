import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "google_business" as const,
  name: "Google Business Profile",
  slug: "google-business",
  icon: "google-business",
  color: "#4285F4",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics"] as PlatformCapability[],
  supportedPostTypes: ["text", "image", "link"] as PostType[],
  supportedMediaTypes: ["jpeg", "png"] as MediaType[],
  maxCaptionLength: 1500,
  info: {
    description: "Create posts on Google Business Profile locations (formerly Google My Business).",
    authTooltip: "Google OAuth 2.0. Requires business.manage scope. Select a location after connecting.",
    limitsTooltip: "Standard Google API quotas. Posting is limited to local post types (update, event, offer).",
    mediaTooltip: "JPEG, PNG. Recommended minimum 720px width. Max 5MB per image.",
    analyticsTooltip: "Impressions, clicks, direction requests, and phone calls via GBP Performance API (coming soon).",
  },
} as const;

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "google_business",
  label: "Google Business",
  category: "social",
  summary: "Google OAuth for Business Profile locations.",
  capabilities: [...config.capabilities],
  futureCapabilities: [...config.futureCapabilities],
  methods: [
    {
      id: "google_business_oauth",
      label: "Connect with Google (Direct)",
      provider: "direct",
      authType: "oauth",
      description: "Authorize through Google OAuth for Business Profile posting.",
      recommendation: "Use for direct location updates.",
      infoTooltip: {
        title: "Business Profile OAuth",
        bullets: [
          "Connects Google Business Profile locations through the business.manage scope.",
          "Location selection matters because posts attach to a specific profile.",
          "Performance analytics can attach later through the same Google account.",
        ],
        learnMoreUrl: "https://developers.google.com/my-business",
      },
      fields: [],
      docs: [
        {
          label: "Google credentials console",
          url: "https://console.cloud.google.com/apis/credentials",
        },
        {
          label: "Business Profile APIs",
          url: "https://developers.google.com/my-business",
        },
        {
          label: "Business Profile setup",
          url: "https://developers.google.com/my-business/content/basic-setup",
        },
      ],
    },
    relayMethod("Google Business", "Business location"),
  ],
};

export const connectionDefinitions = [connectionDefinition];
