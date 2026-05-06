import "server-only";

import crypto from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { platforms } from "@/db/schema";
import { pickPreferredPlatformRow } from "@/lib/platform-dedupe";
import { isPlatformConnectionDisconnected } from "@/lib/platform-connection-state";
import type { PlatformType } from "@/lib/platforms";

export type PlatformProvider = "zernio" | "bird" | "direct";

type PlatformConnectionInput = {
  workspaceId: string;
  name: string;
  type: PlatformType;
  handle?: string | null;
  accountId?: string | null;
  provider: PlatformProvider;
  config?: Record<string, unknown> | null;
  enabled: boolean;
  now?: Date;
  reactivateDisconnected?: boolean;
};

export async function findPlatformByExternalAccount({
  workspaceId,
  provider,
  type,
  accountId,
  excludeId,
  includeDisconnected = false,
}: {
  workspaceId: string;
  provider: PlatformProvider;
  type: PlatformType;
  accountId?: string | null;
  excludeId?: string;
  includeDisconnected?: boolean;
}) {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return null;

  const filters = [
    eq(platforms.workspaceId, workspaceId),
    eq(platforms.provider, provider),
    eq(platforms.type, type),
    eq(platforms.accountId, normalizedAccountId),
  ];

  const rows = await db
    .select()
    .from(platforms)
    .where(and(...(excludeId ? [...filters, ne(platforms.id, excludeId)] : filters)));

  return pickPreferredPlatformRow(
    includeDisconnected
      ? rows
      : rows.filter((row) => !isPlatformConnectionDisconnected(row.config))
  );
}

export async function upsertPlatformConnection(input: PlatformConnectionInput) {
  const now = input.now ?? new Date();
  const reactivateDisconnected = input.reactivateDisconnected ?? true;
  const accountId = normalizeAccountId(input.accountId);
  const existing = await findPlatformByExternalAccount({
    workspaceId: input.workspaceId,
    provider: input.provider,
    type: input.type,
    accountId,
    includeDisconnected: true,
  });

  if (existing) {
    if (isPlatformConnectionDisconnected(existing.config) && !reactivateDisconnected) {
      return { id: existing.id, created: false, skipped: true };
    }

    await db
      .update(platforms)
      .set({
        name: input.name,
        type: input.type,
        handle: normalizeOptional(input.handle),
        accountId,
        provider: input.provider,
        config: input.config ?? null,
        enabled: input.enabled,
        updatedAt: now,
      })
      .where(eq(platforms.id, existing.id));

    return { id: existing.id, created: false };
  }

  const id = crypto.randomUUID();
  await db.insert(platforms).values({
    id,
    workspaceId: input.workspaceId,
    name: input.name,
    type: input.type,
    handle: normalizeOptional(input.handle),
    accountId,
    provider: input.provider,
    config: input.config ?? null,
    enabled: input.enabled,
    createdAt: now,
    updatedAt: now,
  });

  return { id, created: true };
}

function normalizeAccountId(value: string | null | undefined) {
  return normalizeOptional(value);
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
