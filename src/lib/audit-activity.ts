import crypto from "node:crypto";

type AuditActivityInput = {
  auditEventId: string;
  workspaceId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  metadata?: Record<string, unknown>;
  createdAt: Date;
};

const ACTION_LABELS: Record<string, string> = {
  "post.create": "Post created",
  "post.schedule": "Post scheduled",
  "post.update": "Post updated",
  "post.publish": "Post published",
  "post.publish.blocked": "Post publish blocked",
  "post.approval.requested": "Approval requested",
  "post.approval.decided": "Approval decided",
  "post.delete": "Post deleted",
  "reply.post": "Reply posted",
  "schedule.create": "Schedule created",
  "schedule.update": "Schedule updated",
};

function humanizeAuditAction(action: string) {
  const known = ACTION_LABELS[action];
  if (known) return known;

  const label = action.replace(/\./g, " ").replace(/_/g, " ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function severityForAuditStatus(status: unknown) {
  if (typeof status !== "string") return "info";
  const normalized = status.toLowerCase();
  if (["failed", "error", "partial_failure", "deleted"].includes(normalized)) {
    return "error";
  }
  if (["running", "pending", "publishing", "draft", "paused", "blocked", "requested"].includes(normalized)) {
    return "warning";
  }
  return "info";
}

function bodyForAudit(metadata: Record<string, unknown> | undefined) {
  if (typeof metadata?.title === "string" && metadata.title.trim()) return metadata.title.trim();
  if (typeof metadata?.contentPreview === "string" && metadata.contentPreview.trim()) {
    return metadata.contentPreview.trim();
  }
  return "";
}

export function buildAuditActivityLogValue(input: AuditActivityInput) {
  const metadata = {
    ...(input.metadata ?? {}),
    action: input.action,
    auditEventId: input.auditEventId,
    targetType: input.targetType,
    targetId: input.targetId,
  };

  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    eventType: input.action,
    severity: severityForAuditStatus(input.metadata?.status),
    entityType: input.targetType,
    entityId: input.targetId,
    subject: humanizeAuditAction(input.action),
    body: bodyForAudit(input.metadata),
    metadata,
    correlationId: input.auditEventId,
    dedupeKey: `audit:${input.auditEventId}`,
    source: "audit",
    createdAt: input.createdAt,
  };
}
