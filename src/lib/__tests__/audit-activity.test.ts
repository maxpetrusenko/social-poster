import { describe, expect, it } from "vitest";

import { buildAuditActivityLogValue } from "@/lib/audit-activity";

describe("audit activity rows", () => {
  it("turns deleted post audit events into durable workspace activity", () => {
    const createdAt = new Date("2026-04-21T12:00:00.000Z");

    const row = buildAuditActivityLogValue({
      auditEventId: "audit-1",
      workspaceId: "workspace-1",
      actorUserId: "user-1",
      action: "post.delete",
      targetType: "post",
      targetId: "post-1",
      metadata: {
        status: "deleted",
        title: "Launch note",
        href: "/dashboard/posts",
      },
      createdAt,
    });

    expect(row).toMatchObject({
      workspaceId: "workspace-1",
      actorUserId: "user-1",
      eventType: "post.delete",
      severity: "error",
      entityType: "post",
      entityId: "post-1",
      subject: "Post deleted",
      body: "Launch note",
      correlationId: "audit-1",
      dedupeKey: "audit:audit-1",
      source: "audit",
      createdAt,
    });
    expect(row.metadata).toMatchObject({
      auditEventId: "audit-1",
      action: "post.delete",
      status: "deleted",
      href: "/dashboard/posts",
    });
  });
});
