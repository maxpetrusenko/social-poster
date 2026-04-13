import { platforms } from "@/db/schema";

type PlatformRow = typeof platforms.$inferSelect;

export type PublishMediaKind = "text" | "image" | "video" | "reply";

export type PlatformCapabilities = {
  canPublishText: boolean;
  canPublishImage: boolean;
  canPublishVideo: boolean;
  canPublishReply: boolean;
  canSchedule: boolean;
  source: "config" | "legacy-default";
};

function readBoolean(
  source: Record<string, unknown>,
  ...keys: string[]
): boolean | null {
  for (const key of keys) {
    if (typeof source[key] === "boolean") {
      return source[key] as boolean;
    }
  }

  return null;
}

function readCapabilityObject(config: Record<string, unknown>) {
  const capabilities =
    config.capabilities &&
    typeof config.capabilities === "object" &&
    !Array.isArray(config.capabilities)
      ? (config.capabilities as Record<string, unknown>)
      : null;

  if (!capabilities) {
    return null;
  }

  const canPublishText = readBoolean(
    capabilities,
    "canPublishText",
    "can_publish_text"
  );
  const canPublishImage = readBoolean(
    capabilities,
    "canPublishImage",
    "can_publish_image"
  );
  const canPublishVideo = readBoolean(
    capabilities,
    "canPublishVideo",
    "can_publish_video"
  );
  const canPublishReply = readBoolean(
    capabilities,
    "canPublishReply",
    "can_publish_reply"
  );
  const canSchedule = readBoolean(
    capabilities,
    "canSchedule",
    "can_schedule"
  );

  if (
    canPublishText === null &&
    canPublishImage === null &&
    canPublishVideo === null &&
    canPublishReply === null &&
    canSchedule === null
  ) {
    return null;
  }

  return {
    canPublishText: canPublishText ?? true,
    canPublishImage: canPublishImage ?? false,
    canPublishVideo: canPublishVideo ?? false,
    canPublishReply: canPublishReply ?? false,
    canSchedule: canSchedule ?? true,
    source: "config" as const,
  };
}

function readCapabilityArray(config: Record<string, unknown>) {
  const values = Array.isArray(config.capabilities)
    ? config.capabilities
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.toLowerCase())
    : null;

  if (!values || values.length === 0) {
    return null;
  }

  return {
    canPublishText:
      values.includes("publish_text") || values.includes("text"),
    canPublishImage:
      values.includes("publish_image") || values.includes("image"),
    canPublishVideo:
      values.includes("publish_video") || values.includes("video"),
    canPublishReply:
      values.includes("publish_reply") || values.includes("reply"),
    canSchedule:
      values.includes("schedule") || values.includes("can_schedule"),
    source: "config" as const,
  };
}

export function getPlatformCapabilities(
  platform: Pick<PlatformRow, "provider" | "config" | "type">
): PlatformCapabilities {
  const config =
    platform.config && typeof platform.config === "object"
      ? (platform.config as Record<string, unknown>)
      : {};

  const objectCapabilities = readCapabilityObject(config);
  if (objectCapabilities) {
    return objectCapabilities;
  }

  const arrayCapabilities = readCapabilityArray(config);
  if (arrayCapabilities) {
    return arrayCapabilities;
  }

  // Transitional default until social_account_capabilities lands.
  const isBirdProvider = platform.provider === "bird";
  const isBirdX = isBirdProvider && ["twitter", "x"].includes(platform.type);
  const replyOnlyProvider = isBirdProvider && !isBirdX;

  return {
    canPublishText: !replyOnlyProvider,
    canPublishImage: !replyOnlyProvider,
    canPublishVideo: !replyOnlyProvider,
    canPublishReply: isBirdProvider,
    canSchedule: !replyOnlyProvider,
    source: "legacy-default",
  };
}

export function getCapabilityFailureReason(
  capabilities: PlatformCapabilities,
  mediaKind: PublishMediaKind
) {
  if (mediaKind === "reply" && !capabilities.canPublishReply) {
    return "Reply publishing is disabled for this account.";
  }

  if (mediaKind === "video" && !capabilities.canPublishVideo) {
    return "Video publishing is disabled for this account.";
  }

  if (mediaKind === "image" && !capabilities.canPublishImage) {
    return "Image publishing is disabled for this account.";
  }

  if (mediaKind === "text" && !capabilities.canPublishText) {
    return "Text publishing is disabled for this account.";
  }

  return null;
}
