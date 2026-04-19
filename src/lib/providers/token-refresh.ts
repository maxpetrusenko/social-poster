import { and, eq, isNotNull } from "drizzle-orm";
import crypto from "node:crypto";
import { db } from "@/db";
import { auditEvents, platforms } from "@/db/schema";
import {
  mergeProviderCredentials,
  readRefreshToken,
  readTokenExpiresAt,
} from "./credentials";
import { APIError, OAuthError } from "./errors";
import { normalizeNativePlatform } from "./platform-key";
import { getProvider, hasNativeProvider } from "./registry";
import { shouldRefreshToken } from "./token-refresh-policy";

type PlatformRow = typeof platforms.$inferSelect;

export type TokenRefreshStatus =
  | "refreshed"
  | "skipped"
  | "failed"
  | "unsupported";

export type TokenRefreshResult = {
  platformId: string;
  platformType: string;
  platformName: string;
  workspaceId: string | null;
  status: TokenRefreshStatus;
  reason: string;
  expiresAt: string | null;
  nextExpiresAt: string | null;
};

export type TokenRefreshSummary = {
  checked: number;
  refreshed: number;
  skipped: number;
  failed: number;
  unsupported: number;
  results: TokenRefreshResult[];
};

let activeRefresh: Promise<TokenRefreshSummary> | null = null;
let lastSummary: TokenRefreshSummary | null = null;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;

export async function refreshExpiringPlatformTokens(
  options: {
    workspaceId?: string;
    force?: boolean;
    now?: Date;
    refreshWindowMs?: number;
    unknownExpiryRefreshMs?: number;
  } = {}
): Promise<TokenRefreshSummary> {
  if (activeRefresh) return activeRefresh;

  activeRefresh = runTokenRefresh(options).finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

export function getTokenRefreshSnapshot() {
  return {
    running: Boolean(activeRefresh),
    lastStartedAt: lastStartedAt?.toISOString() ?? null,
    lastCompletedAt: lastCompletedAt?.toISOString() ?? null,
    lastSummary,
  };
}

async function runTokenRefresh(
  options: {
    workspaceId?: string;
    force?: boolean;
    now?: Date;
    refreshWindowMs?: number;
    unknownExpiryRefreshMs?: number;
  }
): Promise<TokenRefreshSummary> {
  const now = options.now ?? new Date();
  const refreshWindowMs =
    options.refreshWindowMs ?? readDurationDays("TOKEN_REFRESH_WINDOW_DAYS", 7);
  const unknownExpiryRefreshMs =
    options.unknownExpiryRefreshMs ??
    readDurationDays("TOKEN_UNKNOWN_EXPIRY_REFRESH_DAYS", 30);

  lastStartedAt = now;
  const rows = await selectRefreshablePlatforms(options.workspaceId);
  const results: TokenRefreshResult[] = [];

  for (const platform of rows) {
    results.push(
      await refreshPlatformToken(platform, {
        force: options.force ?? false,
        now,
        refreshWindowMs,
        unknownExpiryRefreshMs,
      })
    );
  }

  const summary = summarize(results);
  lastSummary = summary;
  lastCompletedAt = new Date();
  return summary;
}

async function selectRefreshablePlatforms(workspaceId?: string) {
  const baseFilters = [
    eq(platforms.provider, "direct"),
    eq(platforms.enabled, true),
    isNotNull(platforms.workspaceId),
  ];
  const filters = workspaceId
    ? [...baseFilters, eq(platforms.workspaceId, workspaceId)]
    : baseFilters;

  return db
    .select()
    .from(platforms)
    .where(and(...filters));
}

async function refreshPlatformToken(
  platform: PlatformRow,
  options: {
    force: boolean;
    now: Date;
    refreshWindowMs: number;
    unknownExpiryRefreshMs: number;
  }
): Promise<TokenRefreshResult> {
  const platformKey = normalizeNativePlatform(platform.type);
  const expiresAt = readTokenExpiresAt(platform.config);
  const expiresAtIso = expiresAt ? new Date(expiresAt).toISOString() : null;

  if (!hasNativeProvider(platformKey)) {
    return result(platform, "unsupported", "No native OAuth provider.", expiresAtIso);
  }

  const refreshToken = readRefreshToken(platform.config);
  if (!refreshToken) {
    return result(platform, "skipped", "No refresh token stored.", expiresAtIso);
  }

  if (
    !options.force &&
    !shouldRefreshToken(platform.config, {
      nowMs: options.now.getTime(),
      expiresAt,
      refreshWindowMs: options.refreshWindowMs,
      unknownExpiryRefreshMs: options.unknownExpiryRefreshMs,
    })
  ) {
    return result(platform, "skipped", "Token not inside refresh window.", expiresAtIso);
  }

  try {
    const provider = getProvider(
      platformKey,
      mergeProviderCredentials(platformKey, platform.config)
    );
    const refreshed = await provider.refreshToken(refreshToken);
    const nextExpiresAt = refreshed.expiresIn
      ? options.now.getTime() + refreshed.expiresIn * 1000
      : null;
    const credentials = readCredentialObject(platform.config);
    const nextConfig = {
      ...(platform.config ?? {}),
      credentials: {
        ...credentials,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? refreshToken,
        expiresAt: nextExpiresAt,
        tokenType: refreshed.tokenType ?? credentials.tokenType ?? "Bearer",
        scope: refreshed.scope ?? credentials.scope ?? null,
        lastRefreshedAt: options.now.getTime(),
      },
    };

    await db
      .update(platforms)
      .set({ config: nextConfig, updatedAt: new Date() })
      .where(eq(platforms.id, platform.id));

    await recordTokenRefreshAudit(platform, {
      status: "success",
      expiresAt,
      nextExpiresAt,
    });

    return result(
      platform,
      "refreshed",
      "Token refreshed.",
      expiresAtIso,
      nextExpiresAt ? new Date(nextExpiresAt).toISOString() : null
    );
  } catch (error) {
    const reason = tokenRefreshErrorMessage(error);
    await recordTokenRefreshAudit(platform, {
      status: "failed",
      expiresAt,
      error: reason,
    });
    return result(platform, "failed", reason, expiresAtIso);
  }
}

function result(
  platform: PlatformRow,
  status: TokenRefreshStatus,
  reason: string,
  expiresAt: string | null,
  nextExpiresAt: string | null = null
): TokenRefreshResult {
  return {
    platformId: platform.id,
    platformType: platform.type,
    platformName: platform.name,
    workspaceId: platform.workspaceId,
    status,
    reason,
    expiresAt,
    nextExpiresAt,
  };
}

function summarize(results: TokenRefreshResult[]): TokenRefreshSummary {
  return {
    checked: results.length,
    refreshed: results.filter((entry) => entry.status === "refreshed").length,
    skipped: results.filter((entry) => entry.status === "skipped").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    unsupported: results.filter((entry) => entry.status === "unsupported").length,
    results,
  };
}

function readCredentialObject(config: Record<string, unknown> | null | undefined) {
  return config?.credentials &&
    typeof config.credentials === "object" &&
    !Array.isArray(config.credentials)
    ? (config.credentials as Record<string, unknown>)
    : {};
}

function readDurationDays(key: string, fallbackDays: number) {
  const value = process.env[key];
  if (!value) return fallbackDays * 24 * 60 * 60 * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed * 24 * 60 * 60 * 1000
    : fallbackDays * 24 * 60 * 60 * 1000;
}

async function recordTokenRefreshAudit(
  platform: PlatformRow,
  metadata: Record<string, unknown>
) {
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: null,
    workspaceId: platform.workspaceId,
    actorUserId: null,
    actorEmail: "system",
    action: "platform.token_refresh",
    targetType: "platform",
    targetId: platform.id,
    metadata: {
      platformType: platform.type,
      platformName: platform.name,
      provider: platform.provider,
      ...metadata,
    },
    createdAt: new Date(),
  });
}

function tokenRefreshErrorMessage(error: unknown) {
  if (error instanceof OAuthError || error instanceof APIError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
