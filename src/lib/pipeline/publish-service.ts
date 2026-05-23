import { platforms } from "@/db/schema";
import { db } from "@/db";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import type { InstagramPublishContentType } from "@/lib/post-publish-metadata";
import {
  getCapabilityFailureReason,
  getPlatformCapabilities,
  type PublishMediaKind,
} from "@/lib/platform-capabilities";
import { publishToBird } from "./bird-publisher";
import { publishToLate, type PublishResult } from "./publisher";
import {
  publishViaNativeProvider,
  shouldPublishViaNativeProvider,
} from "@/lib/providers/native-publisher";
import { mediaTypeFromUrl } from "@/lib/media-url";
import { and, eq } from "drizzle-orm";

type PlatformRow = typeof platforms.$inferSelect;

export type PublishPlatformInput = {
  platform: PlatformRow;
  content: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: "image" | "video";
  instagramContentType?: InstagramPublishContentType;
  platformFormat?: string;
  firstComment?: string;
  collaborators?: string[];
  threadLongPosts?: boolean;
};

export type PublishExecutionSummary = {
  outcomes: PublishResult[];
  published: string[];
  errors: Array<{
    platform: string;
    error: string;
    classification: PublishResult["classification"];
  }>;
};

function shouldPublishViaBird(platform: Pick<PlatformRow, "provider" | "type">) {
  return (
    platform.provider === "bird" &&
    ["twitter", "x"].includes(platform.type.toLowerCase())
  );
}

function resolveRequestedMediaKind(
  target: Pick<PublishPlatformInput, "mediaUrl" | "mediaUrls" | "mediaType">
): PublishMediaKind {
  if (target.mediaType === "video") {
    return "video";
  }

  const primaryMediaUrl = resolvePrimaryMediaUrl(target);
  if (primaryMediaUrl) {
    return mediaTypeFromUrl(primaryMediaUrl) === "video" ? "video" : "image";
  }

  if (target.mediaUrl || target.mediaUrls?.length) {
    return "image";
  }

  return "text";
}

function createValidationFailure(
  target: PublishPlatformInput,
  message: string
): PublishResult {
  return {
    platform: target.platform.type,
    provider: getPublishProviderLabel(target.platform),
    accountId: target.platform.accountId,
    success: false,
    classification: "validation_error",
    error: message,
  };
}

function createDisabledSkip(target: PublishPlatformInput): PublishResult {
  return {
    platform: target.platform.type,
    provider: getPublishProviderLabel(target.platform),
    accountId: target.platform.accountId,
    success: false,
    classification: "disabled",
    error: "Target platform is disabled. Ignoring publish for this account.",
  };
}

export async function publishPlatformTargets(
  targets: PublishPlatformInput[]
): Promise<PublishExecutionSummary> {
  const outcomes: PublishResult[] = [];

  for (const target of targets) {
    if (!target.platform.enabled) {
      outcomes.push(createDisabledSkip(target));
      continue;
    }

    const requestedMediaKind = resolveRequestedMediaKind(target);
    const capabilities = getPlatformCapabilities(target.platform);
    const capabilityFailure = getCapabilityFailureReason(
      capabilities,
      requestedMediaKind
    );

    if (capabilityFailure) {
      outcomes.push(createValidationFailure(target, capabilityFailure));
      continue;
    }

    const outcome = await publishSingleTarget(target);

    outcomes.push(outcome);
  }

  return {
    outcomes,
    published: outcomes
      .filter((outcome) => outcome.success)
      .map((outcome) => outcome.platform),
    errors: outcomes
      .filter(
        (outcome) => !outcome.success && outcome.classification !== "disabled"
      )
      .map((outcome) => ({
        platform: outcome.platform,
        error: outcome.error ?? "Unknown error",
        classification: outcome.classification,
      })),
  };
}

async function publishSingleTarget(
  target: PublishPlatformInput
): Promise<PublishResult> {
  if (isXPlatform(target.platform) && shouldPublishViaBird(target.platform)) {
    return publishViaBirdWithDirectFallback(target, target.platform);
  }

  if (isXPlatform(target.platform) && shouldPublishViaNativeProvider(target.platform)) {
    const birdPrimary = await findEnabledXFallbackPlatform(target.platform, "bird");
    if (birdPrimary) {
      return publishViaBirdWithDirectFallback(target, birdPrimary);
    }

    return publishViaNativeProvider(target);
  }

  if (shouldPublishViaNativeProvider(target.platform)) {
    return publishViaNativeProvider(target);
  }

  return (
    await publishToLate([
      {
        platform: target.platform.type,
        accountId: target.platform.accountId,
        content: target.content,
        mediaUrl: target.mediaUrl,
        mediaUrls: target.mediaUrls,
        mediaType: target.mediaType,
        instagramContentType: target.instagramContentType,
        platformFormat: target.platformFormat,
        firstComment: target.firstComment,
        collaborators: target.collaborators,
      },
    ])
  )[0];
}

async function publishViaBirdWithDirectFallback(
  target: PublishPlatformInput,
  birdPlatform: PlatformRow
): Promise<PublishResult> {
  const birdResult = await publishToBird({
    platform: birdPlatform,
    content: target.content,
    mediaUrl: target.mediaUrl,
    mediaUrls: target.mediaUrls,
    threadLongPosts: target.threadLongPosts,
  });

  if (birdResult.success) {
    return birdResult;
  }

  const textOnlyErrors: string[] = [];
  const shouldRetryTextOnly =
    hasMedia(target) &&
    target.content.trim().length > 0 &&
    isMediaFetchFailure(birdResult.error);
  let fallbackTarget = target;

  if (shouldRetryTextOnly) {
    fallbackTarget = stripMedia(target);
    const textOnlyBirdResult = await publishToBird({
      platform: birdPlatform,
      content: fallbackTarget.content,
      threadLongPosts: fallbackTarget.threadLongPosts,
    });

    if (textOnlyBirdResult.success) {
      return {
        ...textOnlyBirdResult,
        raw: {
          ...(typeof textOnlyBirdResult.raw === "object" &&
          textOnlyBirdResult.raw !== null
            ? textOnlyBirdResult.raw
            : {}),
          mediaFallback: {
            primaryProvider: "bird",
            primaryError: birdResult.error,
            action: "published_without_media",
          },
        },
      };
    }

    textOnlyErrors.push(
      `Bird text-only retry failed: ${textOnlyBirdResult.error ?? "Unknown error"}`
    );
  }

  const allowDirectFallback =
    isEnabledXDirectFallback(birdPlatform) || isEnabledXDirectFallback(target.platform);
  if (!allowDirectFallback) {
    return textOnlyErrors.length > 0
      ? {
          ...birdResult,
          error: [
            birdResult.error ?? "Unknown error",
            ...textOnlyErrors,
          ].join("; "),
        }
      : birdResult;
  }

  const directFallback = shouldPublishViaNativeProvider(target.platform)
    ? target.platform
    : await findEnabledXFallbackPlatform(target.platform, "direct");

  if (!directFallback || !shouldPublishViaNativeProvider(directFallback)) {
    return birdResult;
  }

  const directResult = await publishViaNativeProvider({
    ...fallbackTarget,
    platform: directFallback,
  });

  if (directResult.success) {
    return {
      ...directResult,
      raw: {
        primaryProvider: "bird",
        primaryError: birdResult.error,
        fallback: directResult.raw,
      },
    };
  }

  return {
    ...directResult,
    error: [
      `Bird primary failed: ${birdResult.error ?? "Unknown error"}`,
      ...textOnlyErrors,
      `X Direct fallback failed: ${directResult.error ?? "Unknown error"}`,
    ].join("; "),
    raw: {
      primaryProvider: "bird",
      primary: birdResult.raw,
      fallback: directResult.raw,
    },
  };
}

function hasMedia(target: Pick<PublishPlatformInput, "mediaUrl" | "mediaUrls">) {
  return Boolean(target.mediaUrl?.trim() || target.mediaUrls?.some((url) => url.trim()));
}

function stripMedia(target: PublishPlatformInput): PublishPlatformInput {
  const next = { ...target };
  delete next.mediaUrl;
  delete next.mediaUrls;
  delete next.mediaType;
  return next;
}

function isMediaFetchFailure(error?: string | null) {
  return error?.toLowerCase().includes("failed to fetch media") ?? false;
}

function isEnabledXDirectFallback(
  platform: Pick<PlatformRow, "type" | "config"> | null | undefined
) {
  if (!platform) return false;
  if (!isXPlatform(platform)) return false;
  return readStoredConnectionConfig(platform.config).enableDirectFallbackForPublishing === true;
}

function getPublishProviderLabel(
  platform: Pick<PlatformRow, "provider" | "type" | "config">
) {
  if (shouldPublishViaNativeProvider(platform)) return "direct";
  return shouldPublishViaBird(platform) ? "bird" : "late";
}

async function findEnabledXFallbackPlatform(
  platform: Pick<PlatformRow, "id" | "workspaceId" | "provider" | "type" | "handle">,
  provider: "bird" | "direct"
): Promise<PlatformRow | null> {
  if (!platform.workspaceId) return null;

  const rows = await db
    .select()
    .from(platforms)
    .where(
      and(
        eq(platforms.workspaceId, platform.workspaceId),
        eq(platforms.provider, provider),
        eq(platforms.enabled, true)
      )
    );

  const candidates = rows.filter((row) => {
    return row.id !== platform.id && isXPlatform(row);
  });
  if (candidates.length === 0) return null;

  return (
    candidates.find((candidate) => handlesMatch(candidate.handle, platform.handle)) ??
    candidates[0]
  );
}

function isXPlatform(platform: Pick<PlatformRow, "type">) {
  return ["twitter", "x"].includes(platform.type.toLowerCase());
}

function handlesMatch(a?: string | null, b?: string | null) {
  const left = normalizeHandle(a);
  const right = normalizeHandle(b);
  return Boolean(left && right && left === right);
}

function normalizeHandle(value?: string | null) {
  return value?.trim().replace(/^@/, "").toLowerCase() || null;
}

function resolvePrimaryMediaUrl(
  target: Pick<PublishPlatformInput, "mediaUrl" | "mediaUrls">
): string | undefined {
  const arrayMediaUrl = target.mediaUrls?.find((url): url is string => {
    return typeof url === "string" && url.trim().length > 0;
  });
  if (arrayMediaUrl) {
    return arrayMediaUrl.trim();
  }

  const mediaUrl = target.mediaUrl?.trim();
  return mediaUrl || undefined;
}
