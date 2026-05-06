import { db } from "@/db";
import { platforms } from "@/db/schema";
import { eq } from "drizzle-orm";
import { APIError, OAuthError, RateLimitError } from "./errors";
import { getProvider, hasNativeProvider } from "./registry";
import {
  mergeProviderCredentials,
  readAccessToken,
  readRefreshToken,
} from "./credentials";
import { normalizeNativePlatform } from "./platform-key";
import { readStoredConnectionConfig } from "@/lib/connection-config";
import { mediaTypeFromUrl } from "@/lib/media-url";
import type { PublishResult as PipelinePublishResult } from "@/lib/pipeline/publisher";
import type { InstagramPublishContentType } from "@/lib/post-publish-metadata";
import type { PublishContent } from "./types";

type PlatformRow = typeof platforms.$inferSelect;

export type NativePublishInput = {
  platform: PlatformRow;
  content: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  mediaType?: "image" | "video";
  instagramContentType?: InstagramPublishContentType;
  platformFormat?: string;
  firstComment?: string;
  collaborators?: string[];
};

export type NativeDeleteInput = {
  platform: PlatformRow;
  platformPostId: string;
};

export function shouldPublishViaNativeProvider(
  platform: Pick<PlatformRow, "provider" | "type" | "config">
) {
  const platformType = platform.type.toLowerCase();
  if (platformType === "twitter" || platformType === "x") {
    const stored = readStoredConnectionConfig(platform.config);
    return platform.provider === "direct" && isNativeXAuthMethod(stored.authMethod);
  }

  return platform.provider === "direct" && hasNativeProvider(platform.type);
}

export async function publishViaNativeProvider(
  target: NativePublishInput
): Promise<PipelinePublishResult> {
  const platformKey = normalizeNativePlatform(target.platform.type);
  const credentials = mergeProviderCredentials(platformKey, target.platform.config);
  const provider = getProvider(platformKey, credentials);
  const accessToken = await resolveAccessToken(target, provider);

  if (!accessToken) {
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: false,
      classification: "auth_error",
      error: "Native provider missing access token.",
    };
  }

  if (isXMediaPublish(target) && !hasStoredScope(target.platform.config, "media.write")) {
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: false,
      classification: "auth_error",
      error: "X Direct token is missing media.write. Reconnect the X account, then retry media publishing.",
    };
  }

  try {
    const content = buildPublishContent(target);
    const result = await provider.publishPost(accessToken, content);
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: true,
      classification: "success",
      postId: result.platformPostId,
      postUrl: result.url,
      raw: result.extra,
    };
  } catch (error) {
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: false,
      classification: classifyNativeError(error),
      error: error instanceof Error ? error.message : String(error),
      raw: error instanceof APIError || error instanceof OAuthError
        ? error.rawResponse
        : undefined,
    };
  }
}

export async function deleteViaNativeProvider(
  target: NativeDeleteInput
): Promise<PipelinePublishResult> {
  const platformKey = normalizeNativePlatform(target.platform.type);
  const credentials = mergeProviderCredentials(platformKey, target.platform.config);
  const provider = getProvider(platformKey, credentials);
  const accessToken = await resolveAccessToken({ platform: target.platform }, provider);

  if (!accessToken) {
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: false,
      classification: "auth_error",
      error: "Native provider missing access token.",
    };
  }

  try {
    const result = await provider.deletePost(accessToken, target.platformPostId);
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: result.deleted,
      classification: result.deleted ? "success" : "provider_error",
      postId: target.platformPostId,
      raw: result.extra,
      error: result.deleted ? undefined : "Native provider did not confirm deletion.",
    };
  } catch (error) {
    return {
      platform: target.platform.type,
      provider: "direct",
      accountId: target.platform.accountId,
      success: false,
      classification: classifyNativeError(error),
      postId: target.platformPostId,
      error: error instanceof Error ? error.message : String(error),
      raw: error instanceof APIError || error instanceof OAuthError
        ? error.rawResponse
        : undefined,
    };
  }
}

async function resolveAccessToken(
  target: Pick<NativePublishInput, "platform">,
  provider: ReturnType<typeof getProvider>
) {
  const config = target.platform.config;
  const accessToken = readAccessToken(config);
  const refreshToken = readRefreshToken(config);
  const expiresAt = readTokenExpiry(config);

  if (!accessToken) {
    return refreshToken;
  }

  if (!expiresAt || expiresAt > Date.now() + 60_000) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  const refreshed = await provider.refreshToken(refreshToken);
  const nextCredentials = {
    ...readCredentialObject(config),
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? refreshToken,
    expiresAt: refreshed.expiresIn
      ? Date.now() + refreshed.expiresIn * 1000
      : null,
    tokenType: refreshed.tokenType ?? "Bearer",
    scope: refreshed.scope ?? null,
  };
  const nextConfig = {
    ...(config ?? {}),
    credentials: nextCredentials,
  };

  await db
    .update(platforms)
    .set({ config: nextConfig, updatedAt: new Date() })
    .where(eq(platforms.id, target.platform.id));

  return refreshed.accessToken;
}

function buildPublishContent(target: NativePublishInput): PublishContent {
  const normalizedFormat = target.platformFormat?.toLowerCase();
  const mediaUrls = resolveMediaUrls(target);
  const inferredMediaType =
    target.mediaType ?? (mediaUrls[0] ? mediaTypeFromUrl(mediaUrls[0]) ?? undefined : undefined);
  const postType = target.instagramContentType === "story" || normalizedFormat === "story"
    ? "story"
    : target.instagramContentType === "reel" || normalizedFormat === "reel"
      ? "reel"
      : target.instagramContentType === "carousel"
        || normalizedFormat === "carousel"
        || mediaUrls.length > 1
        ? "carousel"
        : inferredMediaType === "video"
          ? "video"
          : mediaUrls.length > 0
            ? "image"
            : "text";

  return {
    text: target.content,
    mediaUrls,
    postType,
    firstComment: target.firstComment,
    extra: buildPublishExtra(target),
  };
}

function buildPublishExtra(target: NativePublishInput) {
  const extra: Record<string, unknown> = {};

  if (target.collaborators?.length) {
    extra.collaborators = target.collaborators;
  }

  if (
    target.platform.type === "linkedin_company" &&
    typeof target.platform.accountId === "string" &&
    target.platform.accountId.startsWith("urn:li:organization:")
  ) {
    extra.author = target.platform.accountId;
  }

  if (
    target.platform.type === "facebook" &&
    typeof target.platform.accountId === "string" &&
    target.platform.accountId.trim()
  ) {
    extra.page_id = target.platform.accountId.trim();
  }

  return Object.keys(extra).length ? extra : undefined;
}

function classifyNativeError(error: unknown): PipelinePublishResult["classification"] {
  if (error instanceof RateLimitError) return "rate_limited";
  if (error instanceof OAuthError) return "auth_error";
  if (error instanceof APIError) {
    if (error.statusCode === 401 || error.statusCode === 403) return "auth_error";
    if (error.statusCode === 400 || error.statusCode === 422) {
      return "validation_error";
    }
    if (error.statusCode === 409) return "duplicate";
    return "provider_error";
  }
  return "network_error";
}

function isNativeXAuthMethod(authMethod: string | null | undefined) {
  return authMethod === "x_oauth" || authMethod === "twitter_native";
}

function isXMediaPublish(target: Pick<NativePublishInput, "platform" | "mediaUrl" | "mediaUrls">) {
  const platformType = target.platform.type.toLowerCase();
  return (
    (platformType === "twitter" || platformType === "x") &&
    Boolean(target.mediaUrl || target.mediaUrls?.some((url) => url?.trim()))
  );
}

function hasStoredScope(
  config: Record<string, unknown> | null | undefined,
  requiredScope: string
) {
  const scope = readCredentialScope(config);
  if (!scope) return true;
  return scope.split(/\s+/).includes(requiredScope);
}

function readCredentialObject(config: Record<string, unknown> | null | undefined) {
  return config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
    ? (config.credentials as Record<string, unknown>)
    : {};
}

function readCredentialScope(config: Record<string, unknown> | null | undefined) {
  const credentials = readCredentialObject(config);
  const scope = credentials.scope ?? config?.scope;
  return typeof scope === "string" ? scope : null;
}

function readTokenExpiry(config: Record<string, unknown> | null | undefined) {
  const credentials = readCredentialObject(config);
  const expiresAt = credentials.expiresAt;
  if (typeof expiresAt === "number") return expiresAt;
  if (typeof expiresAt === "string") {
    const parsed = Number(expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveMediaUrls(target: NativePublishInput): string[] {
  const mediaUrls = (target.mediaUrls ?? [])
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (mediaUrls.length > 0) {
    return mediaUrls;
  }

  const mediaUrl = target.mediaUrl?.trim();
  return mediaUrl ? [mediaUrl] : [];
}
