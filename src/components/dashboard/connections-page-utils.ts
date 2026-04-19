import type { ConnectionMethod } from "@/lib/connection-catalog";
import type { NativeConnectionAvailability } from "@/lib/providers/env-availability";
import type { PlatformType } from "@/lib/platforms";
import type { PlatformRow } from "./connections-types";

export function formatMethodLabel(method: string | null | undefined) {
  if (!method) return "Not set";
  return method
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatProviderLabel(provider: PlatformRow["provider"]) {
  return {
    direct: "Direct",
    bird: "Bird",
    zernio: "Late",
  }[provider];
}

export function getConnectionMethodMode(method: ConnectionMethod) {
  return method.provider === "direct" ? "native" : "proxy";
}

export function getAvailableMethodModes(methods: ConnectionMethod[]) {
  const modes: Array<"native" | "proxy"> = [];
  if (methods.some((method) => getConnectionMethodMode(method) === "native")) {
    modes.push("native");
  }
  if (methods.some((method) => getConnectionMethodMode(method) === "proxy")) {
    modes.push("proxy");
  }
  return modes;
}

export function getDefaultOAuthMethod(methods: ConnectionMethod[]) {
  return methods.find(
    (method) => method.provider === "direct" && method.authType === "oauth"
  );
}

export function isOAuthMethodConfigured(
  platformType: PlatformType,
  nativeAvailabilityByPlatform: Record<PlatformType, NativeConnectionAvailability>
) {
  return nativeAvailabilityByPlatform[platformType]?.configured !== false;
}

export function platformMatchesConnectionFilter(
  platformType: PlatformType,
  selectedPlatform: PlatformType | "all"
) {
  if (selectedPlatform === "all") return true;

  const group = CONNECTION_FILTER_GROUPS[selectedPlatform];
  if (group) return group.includes(platformType);

  return platformType === selectedPlatform;
}

export function getDrawerPlatformForConnectionFilter(
  selectedPlatform: PlatformType | "all",
  selectedMode: "native" | "proxy"
): PlatformType | undefined {
  if (selectedPlatform === "all") return undefined;

  if (selectedPlatform === "linkedin" && selectedMode === "native") {
    return "linkedin_personal";
  }

  return selectedPlatform;
}

export function getManageLabel(platformType: PlatformType) {
  return {
    bluesky: "Manage Account",
    facebook: "Manage Pages",
    google_business: "Manage Locations",
    instagram: "Manage Account",
    instagram_personal: "Manage Account",
    linkedin: "Manage Account",
    linkedin_personal: "Manage Account",
    linkedin_company: "Manage Page",
    mastodon: "Manage Instance",
    pinterest: "Manage Boards",
    reddit: "Manage Subreddit",
    threads: "Manage Account",
    tiktok: "Manage Account",
    twitter: "Manage Account",
    whatsapp: "Manage Channel",
    youtube: "Manage Channel",
  }[platformType];
}

const CONNECTION_FILTER_GROUPS: Partial<Record<PlatformType, PlatformType[]>> = {
  linkedin: ["linkedin", "linkedin_personal", "linkedin_company"],
  instagram: ["instagram", "instagram_personal"],
};
