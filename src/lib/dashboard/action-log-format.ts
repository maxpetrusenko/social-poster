export type ActionLogStatusTone = "success" | "warning" | "danger" | "neutral";

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

export function statusTone(status: string): ActionLogStatusTone {
  const normalized = status.toLowerCase();
  if (
    ["200", "success", "completed", "published", "sent", "created", "scheduled", "updated"].includes(
      normalized
    )
  ) {
    return "success";
  }
  if (["running", "pending", "publishing", "draft", "paused", "blocked", "requested"].includes(normalized)) {
    return "warning";
  }
  if (["failed", "error", "partial_failure", "deleted"].includes(normalized)) return "danger";
  return "neutral";
}

export function humanizeAction(action: string) {
  const known = ACTION_LABELS[action];
  if (known) return known;

  const label = action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function traceFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  const candidate = metadata?.langsmithTrace ?? metadata?.trace;
  if (!candidate || typeof candidate !== "object") {
    return { traceId: null, traceUrl: null };
  }

  const trace = candidate as { runId?: unknown; id?: unknown; url?: unknown };
  return {
    traceId: typeof trace.runId === "string" ? trace.runId : typeof trace.id === "string" ? trace.id : null,
    traceUrl: typeof trace.url === "string" ? trace.url : null,
  };
}
