import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { orgMemberships, users, workspaceInvitations } from "@/db/schema";
import {
  getWorkspaceAllowedDomains,
  getWorkspaceAllowedEmails,
  isSupabaseSignInOpenToAll,
} from "@/lib/supabase/config";
import { resolveAuthMode } from "@/lib/auth-config";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function isEmailAllowedForAuth(email?: string | null) {
  if (!email) {
    return false;
  }

  const normalizedEmail = normalizeEmail(email);

  if (resolveAuthMode() === "supabase" && isSupabaseSignInOpenToAll()) {
    return true;
  }

  const allowlist = getWorkspaceAllowedEmails();
  if (allowlist.includes(normalizedEmail)) {
    return true;
  }

  const allowedDomains = getWorkspaceAllowedDomains();
  const emailDomain = normalizedEmail.split("@")[1] ?? "";
  if (allowedDomains.includes(emailDomain)) {
    return true;
  }

  const existingMember = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(orgMemberships, eq(users.id, orgMemberships.userId))
    .where(eq(users.email, normalizedEmail))
    .get();

  if (existingMember) {
    return true;
  }

  const pendingInvite = await db
    .select({ id: workspaceInvitations.id })
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.email, normalizedEmail),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, new Date())
      )
    )
    .get();

  return Boolean(pendingInvite);
}
