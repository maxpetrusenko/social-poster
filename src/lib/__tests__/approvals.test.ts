import { describe, expect, it } from "vitest";

import {
  mapApprovalRequestRow,
  humanizeApprovalDecision,
  normalizeApprovalWorkflowMode,
  normalizeApprovalReviewState,
  requiresApprovalBeforePublish,
  shouldBlockPublishForApproval,
  type ApprovalRequestRow,
} from "@/lib/approvals";

describe("approvals", () => {
  it("treats approval-gated workspaces as blocked until approved", () => {
    expect(requiresApprovalBeforePublish("none")).toBe(false);
    expect(requiresApprovalBeforePublish("optional")).toBe(false);
    expect(requiresApprovalBeforePublish("required_internal")).toBe(true);
    expect(requiresApprovalBeforePublish("required_internal_and_client")).toBe(true);
  });

  it("normalizes unknown workspace approval modes to disabled", () => {
    expect(normalizeApprovalWorkflowMode("required_internal")).toBe("required_internal");
    expect(normalizeApprovalWorkflowMode("legacy_mode")).toBe("none");
    expect(normalizeApprovalWorkflowMode(null)).toBe("none");
  });

  it("blocks publish while approval is open or missing", () => {
    expect(
      shouldBlockPublishForApproval({
        approvalWorkflowMode: "required_internal",
      })
    ).toMatchObject({
      blocked: true,
      requiresApproval: true,
      approvalState: "none",
    });

    expect(
      shouldBlockPublishForApproval({
        approvalWorkflowMode: "required_internal",
        approvalRequestStatus: "requested",
      })
    ).toMatchObject({
      blocked: true,
      reason: "Requested before publish.",
    });

    expect(
      shouldBlockPublishForApproval({
        approvalWorkflowMode: "required_internal_and_client",
        approvalRequestStatus: "approved",
      })
    ).toMatchObject({
      blocked: false,
      approvalState: "approved",
    });
  });

  it("projects approval request rows into a store-friendly shape", () => {
    const now = new Date("2026-04-21T12:00:00.000Z");
    const row = {
      id: "approval-1",
      workspaceId: "workspace-1",
      postId: "post-1",
      postVariantId: null,
      status: "changes_requested",
      requestedByUserId: "user-1",
      requestedForRole: "client",
      requestedForEmail: "client@example.com",
      dueAt: now,
      openedAt: now,
      resolvedAt: null,
      currentRevisionId: "revision-7",
      policySnapshot: { approvals: ["owner"] },
      createdAt: now,
      updatedAt: now,
    } as ApprovalRequestRow;

    expect(normalizeApprovalReviewState(row.status)).toBe("changes_requested");
    expect(mapApprovalRequestRow(row)).toMatchObject({
      approvalState: "changes_requested",
      isOpen: true,
      isResolved: false,
    });
  });

  it("humanizes approval decisions for the UI", () => {
    expect(humanizeApprovalDecision("approved")).toBe("Approve");
    expect(humanizeApprovalDecision("changes_requested")).toBe("Request changes");
    expect(humanizeApprovalDecision("rejected")).toBe("Reject");
  });
});
