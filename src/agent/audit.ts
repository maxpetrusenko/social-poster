import crypto from "node:crypto";

import type { AgentAuditStatus, AgentRuntimeContext } from "@/agent/types";

export type AgentAuditRecord = {
  id: string;
  organizationId: string;
  workspaceId: string;
  actorUserId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string | null;
  status: AgentAuditStatus;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export function buildAgentAuditRecord(input: {
  context: AgentRuntimeContext;
  action: string;
  targetType: string;
  targetId?: string | null;
  status: AgentAuditStatus;
  metadata?: Record<string, unknown>;
}) {
  const createdAt = input.context.now ?? new Date();

  return {
    id: crypto.randomUUID(),
    organizationId: input.context.organizationId,
    workspaceId: input.context.workspaceId,
    actorUserId: input.context.actorUserId,
    actorEmail: input.context.actorEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    status: input.status,
    metadata: {
      ...input.metadata,
      workspaceName: input.context.workspaceName,
      organizationName: input.context.organizationName,
    },
    createdAt,
  } satisfies AgentAuditRecord;
}
