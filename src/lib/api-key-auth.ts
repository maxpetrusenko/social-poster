import { db } from "@/db";
import { apiKeys, workspaces, organizations, orgMemberships, workspaceMemberships, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createHash } from "crypto";
import { headers } from "next/headers";
import { trackUsage } from "@/lib/usage";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export type ApiKeyContext = {
  apiKeyId: string;
  workspaceId: string;
  scope: string;
  permission: string;
  userId: string;
};

/**
 * Extract and validate an API key from the Authorization: Bearer header.
 * Returns the key context if valid, null otherwise.
 */
export async function validateApiKey(): Promise<ApiKeyContext | null> {
  const headersList = await headers();
  const authHeader = headersList.get("authorization");
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token || !token.startsWith("sk_")) return null;

  const hash = hashKey(token);

  const key = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, hash), eq(apiKeys.status, "active")),
  });

  if (!key) return null;

  // Update lastUsedAt
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));

  // Track API call usage
  await trackUsage(key.workspaceId, "api_call", undefined, { apiKeyId: key.id });

  return {
    apiKeyId: key.id,
    workspaceId: key.workspaceId,
    scope: key.scope,
    permission: key.permission,
    userId: key.createdBy,
  };
}

/**
 * Build a full tenant-like context from an API key for use in routes
 * that need workspace/org/user context.
 */
export async function buildTenantFromApiKey(keyCtx: ApiKeyContext) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, keyCtx.workspaceId),
  });
  if (!workspace) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, keyCtx.userId),
  });
  if (!user) return null;

  const orgMembership = await db.query.orgMemberships.findFirst({
    where: eq(orgMemberships.userId, keyCtx.userId),
  });
  if (!orgMembership) return null;

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgMembership.organizationId),
  });
  if (!org) return null;

  const wsMembership = await db.query.workspaceMemberships.findFirst({
    where: and(
      eq(workspaceMemberships.userId, keyCtx.userId),
      eq(workspaceMemberships.workspaceId, keyCtx.workspaceId)
    ),
  });
  if (!wsMembership) return null;

  return {
    user,
    organization: org,
    orgMembership,
    currentWorkspace: workspace,
    currentWorkspaceMembership: wsMembership,
    session: null,
    accessibleWorkspaces: [],
  };
}
