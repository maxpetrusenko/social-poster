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
import type { PublishResult as PipelinePublishResult } from "@/lib/pipeline/publisher";
import type { PublishContent } from "./types";

type PlatformRow = typeof platforms.$inferSelect;

export type NativePublishInput = {
  platform: PlatformRow;
  content: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  instagramContentType?: "reel" | "story";
};

export function shouldPublishViaNativeProvider(
  platform: Pick<PlatformRow, "provider" | "type">
) {
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

async function resolveAccessToken(
  target: NativePublishInput,
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
  const postType = target.instagramContentType
    ? target.instagramContentType
    : target.mediaType === "video"
      ? "video"
      : target.mediaUrl
        ? "image"
        : "text";

  return {
    text: target.content,
    mediaUrls: target.mediaUrl ? [target.mediaUrl] : [],
    postType,
  };
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

function normalizeNativePlatform(platform: string) {
  if (platform === "linkedin") return "linkedin_personal";
  return platform;
}

function readCredentialObject(config: Record<string, unknown> | null | undefined) {
  return config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
    ? (config.credentials as Record<string, unknown>)
    : {};
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
