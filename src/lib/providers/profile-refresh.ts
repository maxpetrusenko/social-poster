import crypto from "node:crypto";
import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, platforms } from "@/db/schema";
import { readAccessToken, mergeProviderCredentials } from "./credentials";
import { normalizeNativePlatform } from "./platform-key";
import { getProvider, hasNativeProvider } from "./registry";
import type { AccountProfile } from "./types";

type PlatformRow = typeof platforms.$inferSelect;

export type ProfileRefreshResult = {
  platformId: string;
  platformType: string;
  platformName: string;
  workspaceId: string | null;
  status: "refreshed" | "skipped" | "failed" | "unsupported";
  reason: string;
  avatarChanged: boolean;
};

export type ProfileRefreshSummary = {
  checked: number;
  refreshed: number;
  skipped: number;
  failed: number;
  unsupported: number;
  avatarChanged: number;
  results: ProfileRefreshResult[];
};

let activeRefresh: Promise<ProfileRefreshSummary> | null = null;
let lastSummary: ProfileRefreshSummary | null = null;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;

export async function refreshPlatformProfiles(
  options: {
    workspaceId?: string;
    force?: boolean;
    now?: Date;
    refreshAfterMs?: number;
  } = {}
) {
  if (activeRefresh) return activeRefresh;

  activeRefresh = runProfileRefresh(options).finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

export function getProfileRefreshSnapshot() {
  return {
    running: Boolean(activeRefresh),
    lastStartedAt: lastStartedAt?.toISOString() ?? null,
    lastCompletedAt: lastCompletedAt?.toISOString() ?? null,
    lastSummary,
  };
}

async function runProfileRefresh(options: {
  workspaceId?: string;
  force?: boolean;
  now?: Date;
  refreshAfterMs?: number;
}): Promise<ProfileRefreshSummary> {
  const now = options.now ?? new Date();
  const refreshAfterMs =
    options.refreshAfterMs ?? readDurationDays("PROFILE_REFRESH_DAYS", 7);
  lastStartedAt = now;

  const rows = await selectNativePlatforms(options.workspaceId);
  const results: ProfileRefreshResult[] = [];
  for (const platform of rows) {
    results.push(
      await refreshPlatformProfile(platform, {
        force: options.force ?? false,
        now,
        refreshAfterMs,
      })
    );
  }

  const summary = summarize(results);
  lastSummary = summary;
  lastCompletedAt = new Date();
  return summary;
}

async function selectNativePlatforms(workspaceId?: string) {
  const filters = [
    eq(platforms.provider, "direct"),
    eq(platforms.enabled, true),
    isNotNull(platforms.workspaceId),
  ];

  return db
    .select()
    .from(platforms)
    .where(and(...(workspaceId ? [...filters, eq(platforms.workspaceId, workspaceId)] : filters)));
}

async function refreshPlatformProfile(
  platform: PlatformRow,
  options: { force: boolean; now: Date; refreshAfterMs: number }
): Promise<ProfileRefreshResult> {
  const platformKey = normalizeNativePlatform(platform.type);

  if (!hasNativeProvider(platformKey)) {
    return result(platform, "unsupported", "No native provider.", false);
  }

  if (
    !options.force &&
    !shouldRefreshProfile(platform.config, options.now, options.refreshAfterMs)
  ) {
    return result(platform, "skipped", "Profile refreshed recently.", false);
  }

  const accessToken = readAccessToken(platform.config);
  if (!accessToken) {
    return result(platform, "skipped", "No access token stored.", false);
  }

  try {
    const provider = getProvider(
      platformKey,
      mergeProviderCredentials(platformKey, platform.config)
    );
    const profile = await provider.getProfile(accessToken);
    const previousAvatar = readStoredAvatarUrl(platform.config);
    const nextAvatar = profile.avatarUrl ?? null;
    const avatarChanged = Boolean(nextAvatar && nextAvatar !== previousAvatar);
    const nextConfig = {
      ...(platform.config ?? {}),
      providerProfile: profile,
      profileRefresh: {
        checkedAt: options.now.toISOString(),
        avatarChangedAt: avatarChanged
          ? options.now.toISOString()
          : readProfileRefreshString(platform.config, "avatarChangedAt"),
      },
    };

    await db
      .update(platforms)
      .set({
        name: profile.name || platform.name,
        handle: profile.handle ?? platform.handle,
        accountId: profile.platformId || platform.accountId,
        config: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(platforms.id, platform.id));

    if (avatarChanged) {
      await recordProfileRefreshAudit(platform, profile, previousAvatar);
    }

    return result(platform, "refreshed", "Profile refreshed.", avatarChanged);
  } catch (error) {
    return result(
      platform,
      "failed",
      error instanceof Error ? error.message : "Profile refresh failed.",
      false
    );
  }
}

function shouldRefreshProfile(
  config: Record<string, unknown> | null | undefined,
  now: Date,
  refreshAfterMs: number
) {
  const checkedAt = readProfileRefreshString(config, "checkedAt");
  if (!checkedAt) return true;
  const checkedTime = new Date(checkedAt).getTime();
  if (!Number.isFinite(checkedTime)) return true;
  return now.getTime() - checkedTime >= refreshAfterMs;
}

function readStoredAvatarUrl(config: Record<string, unknown> | null | undefined) {
  return (
    readNestedString(config, ["providerProfile", "avatarUrl"]) ||
    readNestedString(config, ["lateAccount", "profilePicture"]) ||
    readNestedString(config, [
      "lateAccount",
      "metadata",
      "profileData",
      "profilePicture",
    ]) ||
    readNestedString(config, [
      "lateAccount",
      "metadata",
      "userProfile",
      "profilePicture",
    ])
  );
}

function readProfileRefreshString(
  config: Record<string, unknown> | null | undefined,
  key: string
) {
  return readNestedString(config, ["profileRefresh", key]);
}

function readNestedString(
  config: Record<string, unknown> | null | undefined,
  path: string[]
) {
  let current: unknown = config;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function result(
  platform: PlatformRow,
  status: ProfileRefreshResult["status"],
  reason: string,
  avatarChanged: boolean
): ProfileRefreshResult {
  return {
    platformId: platform.id,
    platformType: platform.type,
    platformName: platform.name,
    workspaceId: platform.workspaceId,
    status,
    reason,
    avatarChanged,
  };
}

function summarize(results: ProfileRefreshResult[]): ProfileRefreshSummary {
  return {
    checked: results.length,
    refreshed: results.filter((entry) => entry.status === "refreshed").length,
    skipped: results.filter((entry) => entry.status === "skipped").length,
    failed: results.filter((entry) => entry.status === "failed").length,
    unsupported: results.filter((entry) => entry.status === "unsupported").length,
    avatarChanged: results.filter((entry) => entry.avatarChanged).length,
    results,
  };
}

function readDurationDays(key: string, fallbackDays: number) {
  const value = process.env[key];
  if (!value) return fallbackDays * 24 * 60 * 60 * 1000;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed * 24 * 60 * 60 * 1000
    : fallbackDays * 24 * 60 * 60 * 1000;
}

async function recordProfileRefreshAudit(
  platform: PlatformRow,
  profile: AccountProfile,
  previousAvatar: string | null
) {
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: null,
    workspaceId: platform.workspaceId,
    actorUserId: null,
    actorEmail: "system",
    action: "platform.profile_refresh",
    targetType: "platform",
    targetId: platform.id,
    metadata: {
      platformType: platform.type,
      platformName: platform.name,
      previousAvatarUrl: previousAvatar,
      nextAvatarUrl: profile.avatarUrl ?? null,
    },
    createdAt: new Date(),
  });
}
