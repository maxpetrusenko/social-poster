import type { PlatformType } from "@/lib/platforms";

export type PlatformFormat = {
  id: string;
  label: string;
  mediaRequired?: boolean;
  videoOnly?: boolean;
  multiMedia?: boolean;
};

export type ComposerPlatformMeta = {
  label: string;
  icon: string;
  accent: string;
  charLimit: number;
  formats: PlatformFormat[];
  mediaTypes: string[];
  hashtagLimit?: number;
};

export const COMPOSER_PLATFORM_META: Record<PlatformType, ComposerPlatformMeta> = {
  twitter: {
    label: "X / Twitter",
    icon: "X",
    accent: "#1d9bf0",
    charLimit: 280,
    formats: [
      { id: "tweet", label: "Tweet" },
      { id: "thread", label: "Thread" },
    ],
    mediaTypes: ["image", "video", "gif"],
  },
  instagram: {
    label: "Instagram",
    icon: "IG",
    accent: "#e1306c",
    charLimit: 2200,
    formats: [
      { id: "post", label: "Post", mediaRequired: true },
      { id: "story", label: "Story", mediaRequired: true },
      { id: "reel", label: "Reel", mediaRequired: true, videoOnly: true },
      { id: "carousel", label: "Carousel", mediaRequired: true, multiMedia: true },
    ],
    mediaTypes: ["image", "video"],
    hashtagLimit: 30,
  },
  instagram_personal: {
    label: "Instagram Personal / Relay",
    icon: "IP",
    accent: "#c13584",
    charLimit: 2200,
    formats: [
      { id: "post", label: "Post", mediaRequired: true },
      { id: "story", label: "Story", mediaRequired: true },
      { id: "reel", label: "Reel", mediaRequired: true, videoOnly: true },
      { id: "carousel", label: "Carousel", mediaRequired: true, multiMedia: true },
    ],
    mediaTypes: ["image", "video"],
    hashtagLimit: 30,
  },
  linkedin: {
    label: "LinkedIn",
    icon: "Li",
    accent: "#0a66c2",
    charLimit: 3000,
    formats: [
      { id: "post", label: "Post" },
      { id: "article", label: "Article" },
    ],
    mediaTypes: ["image", "video", "document"],
  },
  linkedin_personal: {
    label: "LinkedIn Personal",
    icon: "Li",
    accent: "#0a66c2",
    charLimit: 3000,
    formats: [
      { id: "post", label: "Post" },
      { id: "article", label: "Article" },
    ],
    mediaTypes: ["image", "video", "document"],
  },
  linkedin_company: {
    label: "LinkedIn Company",
    icon: "Li",
    accent: "#004182",
    charLimit: 3000,
    formats: [
      { id: "post", label: "Post" },
      { id: "article", label: "Article" },
    ],
    mediaTypes: ["image", "video", "document"],
  },
  facebook: {
    label: "Facebook",
    icon: "Fb",
    accent: "#1877f2",
    charLimit: 63206,
    formats: [
      { id: "post", label: "Post" },
      { id: "story", label: "Story", mediaRequired: true },
      { id: "reel", label: "Reel", mediaRequired: true, videoOnly: true },
    ],
    mediaTypes: ["image", "video"],
  },
  tiktok: {
    label: "TikTok",
    icon: "Tk",
    accent: "#010101",
    charLimit: 2200,
    formats: [
      { id: "video", label: "Video", mediaRequired: true, videoOnly: true },
      { id: "image", label: "Photo", mediaRequired: true },
    ],
    mediaTypes: ["video", "image"],
  },
  youtube: {
    label: "YouTube",
    icon: "YT",
    accent: "#ff0000",
    charLimit: 5000,
    formats: [
      { id: "video", label: "Video", mediaRequired: true, videoOnly: true },
      { id: "short", label: "Short", mediaRequired: true, videoOnly: true },
    ],
    mediaTypes: ["video"],
  },
  pinterest: {
    label: "Pinterest",
    icon: "Pi",
    accent: "#e60023",
    charLimit: 500,
    formats: [
      { id: "pin", label: "Pin", mediaRequired: true },
      { id: "idea_pin", label: "Idea Pin", mediaRequired: true, multiMedia: true },
    ],
    mediaTypes: ["image", "video"],
  },
  reddit: {
    label: "Reddit",
    icon: "Re",
    accent: "#ff4500",
    charLimit: 40000,
    formats: [
      { id: "text", label: "Text" },
      { id: "link", label: "Link" },
      { id: "image", label: "Image", mediaRequired: true },
      { id: "video", label: "Video", mediaRequired: true, videoOnly: true },
    ],
    mediaTypes: ["image", "video"],
  },
  threads: {
    label: "Threads",
    icon: "Th",
    accent: "#111111",
    charLimit: 500,
    formats: [
      { id: "post", label: "Post" },
      { id: "carousel", label: "Carousel", mediaRequired: true, multiMedia: true },
    ],
    mediaTypes: ["image", "video"],
  },
  bluesky: {
    label: "Bluesky",
    icon: "BS",
    accent: "#1185fe",
    charLimit: 300,
    formats: [{ id: "post", label: "Post" }],
    mediaTypes: ["image", "video"],
  },
  google_business: {
    label: "Google Business",
    icon: "GB",
    accent: "#0f9d58",
    charLimit: 1500,
    formats: [
      { id: "update", label: "Update" },
      { id: "offer", label: "Offer" },
      { id: "event", label: "Event" },
    ],
    mediaTypes: ["image"],
  },
  mastodon: {
    label: "Mastodon",
    icon: "Ma",
    accent: "#6364ff",
    charLimit: 500,
    formats: [
      { id: "status", label: "Status" },
      { id: "poll", label: "Poll" },
    ],
    mediaTypes: ["image", "video", "gif"],
  },
  whatsapp: {
    label: "WhatsApp",
    icon: "WA",
    accent: "#25d366",
    charLimit: 4096,
    formats: [
      { id: "message", label: "Message" },
      { id: "media", label: "Media", mediaRequired: true },
    ],
    mediaTypes: ["image", "video", "document"],
  },
};

export function getLowestCharLimit(platformTypes: PlatformType[]): number {
  if (platformTypes.length === 0) return 5000;
  return Math.min(...platformTypes.map((t) => COMPOSER_PLATFORM_META[t].charLimit));
}
