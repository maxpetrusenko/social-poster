import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";
import type { TenantContext } from "@/lib/tenancy";

export async function recordTenantAuditEvent(
  context: TenantContext,
  input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: context.organization.id,
    workspaceId: input.workspaceId ?? context.currentWorkspace.id,
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata,
    createdAt: new Date(),
  });
}
