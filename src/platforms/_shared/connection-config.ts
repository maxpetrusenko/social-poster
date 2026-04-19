import type { PlatformType } from "../../lib/platforms";
import type { PlatformCapability } from "./types";

export type ConnectionFieldType = "text" | "password" | "textarea" | "toggle";

export type ConnectionField = {
  id: string;
  label: string;
  type: ConnectionFieldType;
  placeholder?: string;
  help?: string;
};

export type ConnectionMethodInfoTooltip = {
  title: string;
  bullets: string[];
  learnMoreUrl?: string;
};

export type ConnectionMethod = {
  id: string;
  label: string;
  provider: "direct" | "zernio" | "bird";
  authType?: "manual" | "oauth";
  description: string;
  recommendation: string;
  infoTooltip?: ConnectionMethodInfoTooltip;
  fields: ConnectionField[];
  docs: Array<{
    label: string;
    url: string;
  }>;
};

export type ConnectionPlatformDefinition = {
  type: PlatformType;
  label: string;
  category: "social" | "community" | "video";
  summary: string;
  capabilities?: PlatformCapability[];
  futureCapabilities?: PlatformCapability[];
  methods: ConnectionMethod[];
};

export function textField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "text", placeholder, help };
}

export function passwordField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "password", placeholder, help };
}

export function textareaField(
  id: string,
  label: string,
  placeholder: string,
  help?: string
): ConnectionField {
  return { id, label, type: "textarea", placeholder, help };
}

export function toggleField(
  id: string,
  label: string,
  help?: string
): ConnectionField {
  return { id, label, type: "toggle", help };
}

export function relayMethod(
  platformLabel: string,
  handlePlaceholder: string
): ConnectionMethod {
  return {
    id: `${platformLabel.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_relay`,
    label: "Managed relay account",
    provider: "zernio",
    authType: "manual",
    description: `Use an existing relay/provider account ID for ${platformLabel}.`,
    recommendation: "Use when this account is already managed in Zernio/Late.",
    infoTooltip: {
      title: "Relay connection",
      bullets: [
        "Stores an external provider account ID instead of user OAuth tokens.",
        "Best for accounts already managed by Late, Zernio, or another proxy.",
        "Publishing depth depends on the upstream relay account.",
      ],
    },
    fields: [
      textField("displayName", "Connection name", `${platformLabel} Relay`),
      textField("handle", "Handle or label", handlePlaceholder),
      textField("providerAccountId", "Provider account ID", "69024a..."),
      textareaField(
        "customInstructions",
        "Relay notes",
        "Publishing caveats, media handling notes, escalation rules"
      ),
    ],
    docs: [],
  };
}
