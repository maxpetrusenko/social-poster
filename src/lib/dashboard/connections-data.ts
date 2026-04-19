import { db } from "@/db";
import { platforms, profiles } from "@/db/schema";
import { getDashboardInsights } from "@/lib/dashboard/insights";
import { refreshPlatformProfiles } from "@/lib/providers/profile-refresh";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";
import { PLATFORM_TYPES, type PlatformType } from "@/lib/platforms";
import type {
  PlatformRow as ConnectionPlatformRow,
  ProfileRow as ConnectionProfileRow,
} from "@/components/dashboard/connections-types";

export async function getConnectionsPageData(workspaceId: string) {
  await syncLateAccountsForWorkspace(workspaceId);
  await refreshPlatformProfiles({ workspaceId }).catch((error) => {
    console.error("[connections] profile refresh failed:", error);
  });

  const [platformRows, profileRows, dashboard] = await Promise.all([
    db.select().from(platforms).where(eq(platforms.workspaceId, workspaceId)),
    db.select().from(profiles).where(eq(profiles.workspaceId, workspaceId)),
    getDashboardInsights(workspaceId),
  ]);

  return {
    platforms: platformRows as ConnectionPlatformRow[],
    profiles: profileRows as ConnectionProfileRow[],
    insights: dashboard.platformInsights,
  };
}

type LateAccount = {
  _id?: string;
  id?: string;
  platform?: string;
  username?: string;
  displayName?: string;
  isActive?: boolean;
  active?: boolean;
};

async function syncLateAccountsForWorkspace(workspaceId: string) {
  const accounts = await fetchLateAccounts().catch(() => []);
  if (accounts.length === 0) return;

  const now = new Date();

  for (const account of accounts) {
    const accountId = account._id ?? account.id;
    const platformType = normalizeLatePlatform(account.platform);
    if (!accountId || !platformType) continue;

    const existing = await db
      .select()
      .from(platforms)
      .where(
        and(
          eq(platforms.workspaceId, workspaceId),
          eq(platforms.provider, "zernio"),
          eq(platforms.accountId, accountId)
        )
      )
      .get();

    const displayName =
      account.displayName?.trim() ||
      account.username?.trim() ||
      `${platformType} via Late`;
    const handle = account.username?.trim() || null;
    const enabled = account.isActive ?? account.active ?? true;
    const config = {
      ...(existing?.config ?? {}),
      authMethod: "late_account",
      credentials: {
        providerAccountId: accountId,
      },
      lateAccount: account,
      notes: "Synced from Late / GetLate connected accounts.",
    };

    if (existing) {
      await db
        .update(platforms)
        .set({
          name: displayName,
          type: platformType,
          handle,
          config,
          enabled,
          updatedAt: now,
        })
        .where(eq(platforms.id, existing.id));
      continue;
    }

    await db.insert(platforms).values({
      id: crypto.randomUUID(),
      workspaceId,
      name: displayName,
      type: platformType,
      handle,
      accountId,
      provider: "zernio",
      config,
      enabled,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function fetchLateAccounts(): Promise<LateAccount[]> {
  const token =
    process.env.LATE_API_KEY ||
    process.env.GETLATE_DEV_API_KEY_FREE ||
    process.env.GETLATE_API_KEY ||
    process.env.ZERNIO_API_KEY;

  if (!token) return [];

  const response = await fetch("https://getlate.dev/api/v1/accounts", {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 300 },
  });

  if (!response.ok) return [];

  const body = (await response.json()) as Record<string, unknown>;
  const accounts = Array.isArray(body.accounts) ? body.accounts : [];
  return accounts.filter(
    (account): account is LateAccount =>
      account !== null && typeof account === "object" && !Array.isArray(account)
  );
}

function normalizeLatePlatform(platform: string | undefined): PlatformType | null {
  const normalized = (platform ?? "").trim().toLowerCase();
  const mapped =
    normalized === "x"
      ? "twitter"
      : normalized === "googlebusiness"
        ? "google_business"
        : normalized === "google-business"
          ? "google_business"
          : normalized === "whats_app"
            ? "whatsapp"
            : normalized;

  return (PLATFORM_TYPES as readonly string[]).includes(mapped)
    ? (mapped as PlatformType)
    : null;
}
