import "server-only";
import crypto from "node:crypto";
import { db } from "@/db";
import { activityLog, auditEvents } from "@/db/schema";
import { buildAuditActivityLogValue } from "@/lib/audit-activity";
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
  const id = crypto.randomUUID();
  const createdAt = new Date();
  const workspaceId = input.workspaceId ?? context.currentWorkspace.id;

  await db.insert(auditEvents).values({
    id,
    organizationId: context.organization.id,
    workspaceId,
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata,
    createdAt,
  });

  if (workspaceId) {
    await db
      .insert(activityLog)
      .values(
        buildAuditActivityLogValue({
          auditEventId: id,
          workspaceId,
          actorUserId: context.user.id,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          metadata: input.metadata,
          createdAt,
        })
      )
      .onConflictDoNothing();
  }
}
