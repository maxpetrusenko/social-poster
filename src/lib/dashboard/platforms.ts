export type PlatformMeta = {
  label: string;
  shortLabel: string;
  accent: string;
  glow: string;
};

export const PLATFORM_META: Record<string, PlatformMeta> = {
  x: { label: "X", shortLabel: "X", accent: "#1d9bf0", glow: "rgba(29,155,240,0.18)" },
  twitter: { label: "X", shortLabel: "X", accent: "#1d9bf0", glow: "rgba(29,155,240,0.18)" },
  linkedin: { label: "LinkedIn", shortLabel: "in", accent: "#0a66c2", glow: "rgba(10,102,194,0.18)" },
  linkedin_personal: { label: "LinkedIn Personal", shortLabel: "LP", accent: "#0a66c2", glow: "rgba(10,102,194,0.18)" },
  linkedin_company: { label: "LinkedIn Company", shortLabel: "LC", accent: "#004182", glow: "rgba(0,65,130,0.18)" },
  instagram: { label: "Instagram", shortLabel: "IG", accent: "#e4405f", glow: "rgba(228,64,95,0.18)" },
  tiktok: { label: "TikTok", shortLabel: "TT", accent: "#111111", glow: "rgba(17,17,17,0.12)" },
  facebook: { label: "Facebook", shortLabel: "FB", accent: "#1877f2", glow: "rgba(24,119,242,0.18)" },
  pinterest: { label: "Pinterest", shortLabel: "PI", accent: "#e60023", glow: "rgba(230,0,35,0.14)" },
  reddit: { label: "Reddit", shortLabel: "r/", accent: "#ff4500", glow: "rgba(255,69,0,0.18)" },
  youtube: { label: "YouTube", shortLabel: "YT", accent: "#ff0000", glow: "rgba(255,0,0,0.16)" },
  threads: { label: "Threads", shortLabel: "TH", accent: "#111111", glow: "rgba(17,17,17,0.12)" },
  bluesky: { label: "Bluesky", shortLabel: "BS", accent: "#1185fe", glow: "rgba(17,133,254,0.18)" },
  google_business: { label: "Google Business", shortLabel: "GB", accent: "#0f9d58", glow: "rgba(15,157,88,0.16)" },
  mastodon: { label: "Mastodon", shortLabel: "MA", accent: "#6364ff", glow: "rgba(99,100,255,0.16)" },
  instagram_personal: { label: "Instagram Personal", shortLabel: "IP", accent: "#c13584", glow: "rgba(193,53,132,0.16)" },
  whatsapp: { label: "WhatsApp", shortLabel: "WA", accent: "#25d366", glow: "rgba(37,211,102,0.16)" },
};

export function normalizePlatformType(value: string | null | undefined): string {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "twitter") return "x";
  return normalized;
}

export function getPlatformMeta(value: string | null | undefined): PlatformMeta {
  const key = normalizePlatformType(value);
  return PLATFORM_META[key] ?? {
    label: value || "Unknown",
    shortLabel: (value || "?").slice(0, 2).toUpperCase(),
    accent: "#64748b",
    glow: "rgba(100,116,139,0.16)",
  };
}

export function getPlatformLabel(value: string | null | undefined): string {
  return getPlatformMeta(value).label;
}
