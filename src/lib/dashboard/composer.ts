import { getPlatformCapabilities } from "@/lib/platform-capabilities";
import { normalizePlatformType } from "@/lib/dashboard/platforms";
import { dedupePlatformRows } from "@/lib/platform-dedupe";

type PlatformRow = {
  id: string;
  workspaceId: string | null;
  name: string;
  handle: string | null;
  type: string;
  accountId: string | null;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  createdAt?: Date | number | string | null;
  updatedAt?: Date | number | string | null;
};

export type ComposerProfile = {
  id: string;
  name: string;
};

export type ComposerPlatform = {
  id: string;
  name: string;
  handle: string | null;
  type: string;
  provider: string;
  enabled: boolean;
  capabilities: ReturnType<typeof getPlatformCapabilities>;
};

export type ComposerInitialValues = {
  title?: string;
  content?: string;
  contentType?: string;
  sourceUrl?: string;
  mediaUrl?: string;
  scheduledAt?: string;
  profileId?: string;
  platformIds?: string[];
};

export function mapComposerPlatforms(platformRows: PlatformRow[]): ComposerPlatform[] {
  return dedupeComposerPlatformRows(platformRows).map((platform) => ({
    id: platform.id,
    name: platform.name,
    handle: platform.handle,
    type: platform.type,
    provider: platform.provider,
    enabled: platform.enabled,
    capabilities: getPlatformCapabilities(platform),
  }));
}

export function parseComposerPlatformConfig(
  value: unknown
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function dedupeComposerPlatformRows(platformRows: PlatformRow[]): PlatformRow[] {
  const enabledRows = platformRows.filter((platform) => platform.enabled);
  const accountDedupedRows = dedupePlatformRows(enabledRows);
  const output: PlatformRow[] = [];
  const indexByHandleIdentity = new Map<string, number>();

  for (const row of accountDedupedRows) {
    const identity = platformHandleIdentity(row);
    if (!identity) {
      output.push(row);
      continue;
    }

    const existingIndex = indexByHandleIdentity.get(identity);
    if (existingIndex === undefined) {
      indexByHandleIdentity.set(identity, output.length);
      output.push(row);
      continue;
    }

    output[existingIndex] = pickPreferredComposerPlatform(output[existingIndex], row);
  }

  return output;
}

function platformHandleIdentity(row: PlatformRow) {
  const handle = normalizeHandle(row.handle);
  if (!row.workspaceId || !handle) return null;
  return [
    row.workspaceId,
    normalizePlatformType(row.type),
    handle,
  ].join("\u001f");
}

function normalizeHandle(handle: string | null | undefined) {
  return (handle || "").trim().replace(/^@+/, "").toLowerCase();
}

function pickPreferredComposerPlatform(left: PlatformRow, right: PlatformRow) {
  const providerDelta = providerRank(right.provider) - providerRank(left.provider);
  if (providerDelta !== 0) return providerDelta > 0 ? right : left;

  const updatedDelta = timeValue(right.updatedAt) - timeValue(left.updatedAt);
  if (updatedDelta !== 0) return updatedDelta > 0 ? right : left;

  const createdDelta = timeValue(right.createdAt) - timeValue(left.createdAt);
  if (createdDelta !== 0) return createdDelta > 0 ? right : left;

  return right.id.localeCompare(left.id) > 0 ? right : left;
}

function providerRank(provider: string) {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "direct") return 3;
  if (normalized === "bird") return 2;
  if (normalized === "zernio" || normalized === "late") return 1;
  return 0;
}

function timeValue(value: Date | number | string | null | undefined) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
