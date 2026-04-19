import type { PlatformCapability, PostType, MediaType, AuthType } from "../_shared/types";
import {
  relayMethod,
  type ConnectionPlatformDefinition,
} from "../_shared/connection-config";

export const config = {
  id: "linkedin" as const,
  name: "LinkedIn",
  slug: "linkedin",
  icon: "linkedin",
  color: "#0A66C2",
  authType: "oauth2" as AuthType,
  tokenExpiry: true,
  capabilities: ["posting"] as PlatformCapability[],
  futureCapabilities: ["analytics", "comments"] as PlatformCapability[],
  supportedPostTypes: ["text", "image", "video", "link", "article", "poll"] as PostType[],
  supportedMediaTypes: ["jpeg", "png", "gif", "mp4"] as MediaType[],
  maxCaptionLength: 3000,
  variants: ["linkedin_personal", "linkedin_company"] as const,
  info: {
    description: "Share posts, articles, and media to LinkedIn profiles and company pages.",
    authTooltip: "OAuth 2.0. Personal profiles use r_basicprofile + w_member_social. Company pages add w_organization_social.",
    limitsTooltip: "100 posts/day for members, 100 shares/day for company pages.",
    mediaTooltip: "Images (JPEG, PNG, GIF) and video (MP4) via binary upload to pre-signed URLs.",
    analyticsTooltip: "Post impressions, clicks, and engagement rate via organization analytics API (coming soon).",
  },
} as const;

const linkedinDocs = [
  {
    label: "LinkedIn developer apps",
    url: "https://www.linkedin.com/developers/apps",
  },
  {
    label: "LinkedIn auth overview",
    url: "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
  },
];

function linkedinOAuthDefinition(
  type: "linkedin_personal" | "linkedin_company",
  label: string,
  methodLabel: string,
  relayLabel: string,
  relayHandle: string
): ConnectionPlatformDefinition {
  return {
    type,
    label,
    category: "social",
    summary:
      type === "linkedin_personal"
        ? "Member profile connection."
        : "Company page connection.",
    capabilities: [...config.capabilities],
    futureCapabilities: [...config.futureCapabilities],
    methods: [
      {
        id: `${type}_oauth`,
        label: methodLabel,
        provider: "direct",
        authType: "oauth",
        description:
          "Authorize through LinkedIn OAuth and store the member or page token for direct publishing.",
        recommendation:
          type === "linkedin_personal"
            ? "Preferred path for direct member posting."
            : "Use for direct company posting when the required LinkedIn APIs are approved.",
        infoTooltip: {
          title: `${label} OAuth`,
          bullets: [
            "Connects a real LinkedIn identity through an approved developer app.",
            "Personal and company publishing use different permissions and ownership checks.",
            "Future depth adds comments and post analytics from the same platform module.",
          ],
          learnMoreUrl:
            "https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication",
        },
        fields: [],
        docs: linkedinDocs,
      },
      relayMethod(relayLabel, relayHandle),
    ],
  };
}

export const connectionDefinition: ConnectionPlatformDefinition = {
  type: "linkedin",
  label: "LinkedIn",
  category: "social",
  summary: "Late-managed LinkedIn account proxy.",
  capabilities: [],
  futureCapabilities: [...config.capabilities, ...config.futureCapabilities],
  methods: [relayMethod("LinkedIn", "Max Petrusenko")],
};

export const connectionDefinitionPersonal = linkedinOAuthDefinition(
  "linkedin_personal",
  "LinkedIn Profile",
  "Connect with LinkedIn (Direct)",
  "LinkedIn Personal",
  "Max Petrusenko"
);

export const connectionDefinitionCompany = linkedinOAuthDefinition(
  "linkedin_company",
  "LinkedIn Page",
  "Connect LinkedIn Company (Direct)",
  "LinkedIn Company",
  "Company Page"
);

export const connectionDefinitions = [
  connectionDefinition,
  connectionDefinitionPersonal,
  connectionDefinitionCompany,
];
