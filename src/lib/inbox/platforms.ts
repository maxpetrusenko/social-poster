export type InboxSurface = "replies" | "comments" | "dms";

export type InboxPlatformGroup = {
  key: string;
  label: string;
  types: string[];
  comments: "live" | "planned" | "blocked";
  dms: "live" | "planned" | "blocked";
  note: string;
};

export const INBOX_PLATFORM_GROUPS: InboxPlatformGroup[] = [
  {
    key: "x",
    label: "X / Twitter",
    types: ["twitter", "x"],
    comments: "live",
    dms: "live",
    note: "X Replies is outbound outreach. X / Twitter Comments pulls inbound mentions and replies via Bird or X API; DMs use the X DM API when dm.read and dm.write scopes are present.",
  },
  {
    key: "linkedin",
    label: "LinkedIn",
    types: ["linkedin", "linkedin_personal", "linkedin_company"],
    comments: "live",
    dms: "blocked",
    note: "Comments use LinkedIn socialActions where scopes allow. DMs require partner messaging access.",
  },
  {
    key: "instagram",
    label: "Instagram",
    types: ["instagram", "instagram_personal"],
    comments: "live",
    dms: "live",
    note: "Comments use Instagram comment APIs. DMs use Meta conversations when Instagram Messaging review and account eligibility are in place.",
  },
  {
    key: "threads",
    label: "Threads",
    types: ["threads"],
    comments: "live",
    dms: "blocked",
    note: "Threads public replies are supported by API permissions; DMs do not exist as an API surface.",
  },
  {
    key: "youtube",
    label: "YouTube",
    types: ["youtube"],
    comments: "live",
    dms: "blocked",
    note: "Comments use YouTube Data API. YouTube has no DM API.",
  },
  {
    key: "facebook",
    label: "Facebook",
    types: ["facebook"],
    comments: "live",
    dms: "live",
    note: "Page comments use Graph API. Page messages use Messenger conversations when Page messaging permissions are in place.",
  },
  {
    key: "tiktok",
    label: "TikTok",
    types: ["tiktok"],
    comments: "planned",
    dms: "blocked",
    note: "TikTok comments require the right Content Posting/Research permissions. DMs are not available here.",
  },
  {
    key: "bluesky",
    label: "Bluesky",
    types: ["bluesky"],
    comments: "planned",
    dms: "planned",
    note: "Bluesky replies and chat can be added through AT Protocol modules.",
  },
  {
    key: "mastodon",
    label: "Mastodon",
    types: ["mastodon"],
    comments: "live",
    dms: "live",
    note: "Mastodon replies use status context. DMs use the conversations API and direct statuses.",
  },
  {
    key: "reddit",
    label: "Reddit",
    types: ["reddit"],
    comments: "planned",
    dms: "planned",
    note: "Reddit comments and inbox require OAuth app approval and subreddit context.",
  },
  {
    key: "pinterest",
    label: "Pinterest",
    types: ["pinterest"],
    comments: "blocked",
    dms: "blocked",
    note: "Pinterest does not expose a useful first-party comments or DM workflow for this inbox yet.",
  },
  {
    key: "google_business",
    label: "Google Business",
    types: ["google_business"],
    comments: "planned",
    dms: "planned",
    note: "Reviews and messages need Business Profile APIs, separate from posting.",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    types: ["whatsapp"],
    comments: "blocked",
    dms: "planned",
    note: "WhatsApp is a messaging-only surface through the Business Platform.",
  },
];

export function getInboxPlatformGroup(key: string) {
  return INBOX_PLATFORM_GROUPS.find((group) => group.key === key);
}

export function getInboxPlatformGroupByType(type: string) {
  const normalized = type.toLowerCase();
  return INBOX_PLATFORM_GROUPS.find((group) => group.types.includes(normalized));
}

export function isInboxSurface(value: string | null | undefined): value is InboxSurface {
  return value === "replies" || value === "comments" || value === "dms";
}

export function getCapabilityForSurface(
  group: InboxPlatformGroup,
  surface: InboxSurface
) {
  if (surface === "comments") return group.comments;
  if (surface === "dms") return group.dms;
  return group.key === "x" ? "live" : group.comments;
}
