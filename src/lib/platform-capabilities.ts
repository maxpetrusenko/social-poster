import { platforms } from "@/db/schema";

type PlatformRow = typeof platforms.$inferSelect;

export type PublishMediaKind = "text" | "image" | "video" | "reply";

export type PlatformCapabilityKey =
  | "publish.text"
  | "publish.image"
  | "publish.video"
  | "publish.reply"
  | "publish.schedule"
  | "publish.thread"
  | "publish.long_text"
  | "publish.link_preview_image"
  | "publish.source_share";

export type PlatformCapabilityStatus =
  | "supported"
  | "unsupported"
  | "unknown"
  | "degraded";

export type PlatformCapabilityConfidence =
  | "observed"
  | "verified"
  | "operator_confirmed"
  | "config"
  | "provider_default";

export type PlatformCapabilityEntry = {
  key: PlatformCapabilityKey;
  status: PlatformCapabilityStatus;
  confidence: PlatformCapabilityConfidence;
  source: "config" | "legacy-default" | "operator" | "observed";
  reason?: string;
};

export type PlatformCapabilityGraph = Record<
  PlatformCapabilityKey,
  PlatformCapabilityEntry
>;

export type PlatformCapabilities = {
  canPublishText: boolean;
  canPublishImage: boolean;
  canPublishVideo: boolean;
  canPublishReply: boolean;
  canSchedule: boolean;
  canPublishLongText: boolean;
  canPublishThread: boolean;
  canPublishSourceShare: boolean;
  source: "config" | "legacy-default";
  graph: PlatformCapabilityGraph;
};

type ConfigCapabilities = {
  canPublishText: boolean;
  canPublishImage: boolean;
  canPublishVideo: boolean;
  canPublishReply: boolean;
  canSchedule: boolean;
  canPublishLongText: boolean;
  canPublishThread: boolean;
  canPublishSourceShare: boolean;
  source: "config";
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

function readCapabilityObject(config: Record<string, unknown>): ConfigCapabilities | null {
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
  const canPublishLongText = readBoolean(
    capabilities,
    "canPublishLongText",
    "can_publish_long_text"
  );
  const canPublishThread = readBoolean(
    capabilities,
    "canPublishThread",
    "can_publish_thread"
  );
  const canPublishSourceShare = readBoolean(
    capabilities,
    "canPublishSourceShare",
    "can_publish_source_share"
  );

  if (
    canPublishText === null &&
    canPublishImage === null &&
    canPublishVideo === null &&
    canPublishReply === null &&
    canSchedule === null &&
    canPublishLongText === null &&
    canPublishThread === null &&
    canPublishSourceShare === null
  ) {
    return null;
  }

  return {
    canPublishText: canPublishText ?? true,
    canPublishImage: canPublishImage ?? false,
    canPublishVideo: canPublishVideo ?? false,
    canPublishReply: canPublishReply ?? false,
    canSchedule: canSchedule ?? true,
    canPublishLongText: canPublishLongText ?? false,
    canPublishThread: canPublishThread ?? false,
    canPublishSourceShare: canPublishSourceShare ?? true,
    source: "config",
  };
}

function readCapabilityArray(config: Record<string, unknown>): ConfigCapabilities | null {
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
    canPublishLongText:
      values.includes("publish_long_text") ||
      values.includes("long_text") ||
      values.includes("long_post") ||
      values.includes("long-post"),
    canPublishThread:
      values.includes("publish_thread") || values.includes("thread"),
    canPublishSourceShare:
      values.includes("publish_source_share") ||
      values.includes("source_share") ||
      values.includes("link"),
    source: "config",
  };
}

function capability(
  key: PlatformCapabilityKey,
  status: PlatformCapabilityStatus,
  confidence: PlatformCapabilityConfidence,
  source: PlatformCapabilityEntry["source"],
  reason?: string
): PlatformCapabilityEntry {
  return { key, status, confidence, source, reason };
}

function statusFor(value: boolean): PlatformCapabilityStatus {
  return value ? "supported" : "unsupported";
}

function toEntry(
  key: PlatformCapabilityKey,
  value: boolean,
  source: PlatformCapabilityEntry["source"],
  reason?: string
) {
  return capability(
    key,
    statusFor(value),
    source === "config" ? "config" : "provider_default",
    source,
    reason
  );
}

function isSupported(entry: PlatformCapabilityEntry) {
  return entry.status === "supported" || entry.status === "degraded";
}

function readConfigCapabilities(config: Record<string, unknown>) {
  return readCapabilityObject(config) ?? readCapabilityArray(config);
}

export function getPlatformCapabilityGraph(
  platform: Pick<PlatformRow, "provider" | "config" | "type">
): PlatformCapabilityGraph {
  const config =
    platform.config && typeof platform.config === "object"
      ? (platform.config as Record<string, unknown>)
      : {};
  const fromConfig = readConfigCapabilities(config);
  const source = fromConfig ? "config" : "legacy-default";

  const isBirdProvider = platform.provider === "bird";
  const isBirdX = isBirdProvider && ["twitter", "x"].includes(platform.type);
  const replyOnlyProvider = isBirdProvider && !isBirdX;

  const canPublishText = fromConfig?.canPublishText ?? !replyOnlyProvider;
  const canPublishImage = fromConfig?.canPublishImage ?? !replyOnlyProvider;
  const canPublishVideo = fromConfig?.canPublishVideo ?? !replyOnlyProvider;
  const canPublishReply = fromConfig?.canPublishReply ?? isBirdProvider;
  const canSchedule = fromConfig?.canSchedule ?? !replyOnlyProvider;
  const canPublishThread = fromConfig?.canPublishThread ?? isBirdX;
  const canPublishLongText = fromConfig?.canPublishLongText ?? false;
  const canPublishSourceShare = fromConfig?.canPublishSourceShare ?? true;

  return {
    "publish.text": toEntry("publish.text", canPublishText, source),
    "publish.image": toEntry("publish.image", canPublishImage, source),
    "publish.video": toEntry("publish.video", canPublishVideo, source),
    "publish.reply": toEntry("publish.reply", canPublishReply, source),
    "publish.schedule": toEntry("publish.schedule", canSchedule, source),
    "publish.thread": toEntry("publish.thread", canPublishThread, source),
    "publish.long_text": capability(
      "publish.long_text",
      canPublishLongText ? "supported" : "unknown",
      fromConfig?.canPublishLongText ? "config" : "provider_default",
      source,
      canPublishLongText
        ? "Account is configured for long-form posts."
        : "Long-form support depends on the connected account entitlement."
    ),
    "publish.link_preview_image": toEntry(
      "publish.link_preview_image",
      canPublishImage,
      source,
      "External links can resolve to Open Graph images when image publishing works."
    ),
    "publish.source_share": toEntry(
      "publish.source_share",
      canPublishSourceShare,
      source,
      "Source-share posts credit the original URL instead of copying media."
    ),
  };
}

export function getPlatformCapabilities(
  platform: Pick<PlatformRow, "provider" | "config" | "type">
): PlatformCapabilities {
  const config =
    platform.config && typeof platform.config === "object"
      ? (platform.config as Record<string, unknown>)
      : {};
  const graph = getPlatformCapabilityGraph(platform);
  const source = readConfigCapabilities(config) ? "config" : "legacy-default";

  return {
    canPublishText: isSupported(graph["publish.text"]),
    canPublishImage: isSupported(graph["publish.image"]),
    canPublishVideo: isSupported(graph["publish.video"]),
    canPublishReply: isSupported(graph["publish.reply"]),
    canSchedule: isSupported(graph["publish.schedule"]),
    canPublishLongText: isSupported(graph["publish.long_text"]),
    canPublishThread: isSupported(graph["publish.thread"]),
    canPublishSourceShare: isSupported(graph["publish.source_share"]),
    source,
    graph,
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
