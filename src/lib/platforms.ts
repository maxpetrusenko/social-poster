export const PLATFORM_TYPES = [
  "twitter",
  "linkedin",
  "linkedin_personal",
  "linkedin_company",
  "instagram",
  "tiktok",
  "facebook",
  "reddit",
  "pinterest",
  "youtube",
  "threads",
  "bluesky",
  "google_business",
  "mastodon",
  "instagram_personal",
  "whatsapp",
] as const;

export type PlatformType = (typeof PLATFORM_TYPES)[number];

export const PLATFORM_OPTIONS: Array<{ value: PlatformType; label: string }> = [
  { value: "twitter", label: "Twitter / X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "linkedin_personal", label: "LinkedIn Personal" },
  { value: "linkedin_company", label: "LinkedIn Company" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "facebook", label: "Facebook" },
  { value: "reddit", label: "Reddit" },
  { value: "pinterest", label: "Pinterest" },
  { value: "youtube", label: "YouTube" },
  { value: "threads", label: "Threads" },
  { value: "bluesky", label: "Bluesky" },
  { value: "google_business", label: "Google Business Profile" },
  { value: "mastodon", label: "Mastodon" },
  { value: "instagram_personal", label: "Instagram Personal / Relay" },
  { value: "whatsapp", label: "WhatsApp" },
];

type PlatformConfig = Record<string, unknown> | null | undefined;

export function readPlatformConfig(config: PlatformConfig) {
  const source: Record<string, unknown> = config ?? {};
  const skills = Array.isArray(source.skills)
    ? source.skills
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
  const notes = typeof source.notes === "string" ? source.notes : "";
  const advancedConfig = Object.fromEntries(
    Object.entries(source).filter(([key]) => key !== "skills" && key !== "notes")
  );

  return {
    skills,
    notes,
    skillsText: skills.join("\n"),
    advancedConfigText:
      Object.keys(advancedConfig).length > 0
        ? JSON.stringify(advancedConfig, null, 2)
        : "",
  };
}

export function parsePlatformSkills(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

export function buildPlatformConfig({
  skillsText,
  notes,
  advancedConfigText,
}: {
  skillsText: string;
  notes: string;
  advancedConfigText: string;
}) {
  const trimmedJson = advancedConfigText.trim();
  let advancedConfig: Record<string, unknown> = {};

  if (trimmedJson) {
    const parsed = JSON.parse(trimmedJson);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Advanced config must be a JSON object");
    }
    advancedConfig = parsed as Record<string, unknown>;
  }

  const config: Record<string, unknown> = { ...advancedConfig };
  const skills = parsePlatformSkills(skillsText);
  const trimmedNotes = notes.trim();

  if (skills.length > 0) {
    config.skills = skills;
  }

  if (trimmedNotes) {
    config.notes = trimmedNotes;
  }

  return Object.keys(config).length > 0 ? config : null;
}

export function getPlatformSkills(config: PlatformConfig) {
  return readPlatformConfig(config).skills;
}
