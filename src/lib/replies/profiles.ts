import type { ReplyDirection } from "@/lib/replies/strategy";

export const LEGACY_REPLY_PROFILE_IDS = [
  "agent-persona-product",
  "agent-persona-build",
  "agent-persona-oss",
] as const;

export const REPLY_PROFILE_IDS = [
  "agent-persona",
] as const;

export const ACCEPTED_REPLY_PROFILE_IDS = [
  ...REPLY_PROFILE_IDS,
  ...LEGACY_REPLY_PROFILE_IDS,
] as const;

export type ReplyProfileId = (typeof REPLY_PROFILE_IDS)[number];

export type ReplyProfile = {
  id: ReplyProfileId;
  label: string;
  directions: ReplyDirection[];
  goal: string;
  destination: string;
  summary: string;
};

export const REPLY_PROFILES: ReplyProfile[] = [
  {
    id: "agent-persona",
    label: "Agent Persona",
    directions: ["dev", "product", "github"],
    goal: "Earn technical trust first, then bridge into product use cases or the repo when the tweet fits.",
    destination: "agent-persona.org",
    summary: "Mixed dev, product, and OSS lanes.",
  },
];

export const DEFAULT_REPLY_PROFILE_ID: ReplyProfileId = "agent-persona";

export function getReplyProfiles() {
  return REPLY_PROFILES;
}

export function getReplyProfile(profileId?: string | null): ReplyProfile {
  return (
    REPLY_PROFILES.find((profile) => profile.id === profileId) ??
    REPLY_PROFILES.find((profile) => profile.id === DEFAULT_REPLY_PROFILE_ID)!
  );
}

export function isAgentPersonaProfile(value?: string | null) {
  return (
    value === "agent-persona" ||
    LEGACY_REPLY_PROFILE_IDS.includes(value as (typeof LEGACY_REPLY_PROFILE_IDS)[number])
  );
}
