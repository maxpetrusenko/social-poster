import type { ApprovalWorkflowMode } from "@/lib/tenancy";
import { approvalRequests } from "@/db/schema";

export const APPROVAL_REQUEST_STATUSES = [
  "requested",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "withdrawn",
  "expired",
] as const;

export const APPROVAL_REVIEW_STATES = ["none", ...APPROVAL_REQUEST_STATUSES] as const;
export const APPROVAL_DECISIONS = [
  "approved",
  "changes_requested",
  "rejected",
] as const;
const APPROVAL_WORKFLOW_MODES = [
  "none",
  "optional",
  "required_internal",
  "required_internal_and_client",
] as const satisfies readonly ApprovalWorkflowMode[];

const OPEN_APPROVAL_REQUEST_STATUSES = new Set<ApprovalRequestStatus>([
  "requested",
  "in_review",
  "changes_requested",
]);
const RESOLVED_APPROVAL_REQUEST_STATUSES = new Set<ApprovalRequestStatus>([
  "approved",
  "rejected",
  "withdrawn",
  "expired",
]);

export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];
export type ApprovalReviewState = (typeof APPROVAL_REVIEW_STATES)[number];
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
export type ApprovalRequestRow = Omit<typeof approvalRequests.$inferSelect, "status"> & {
  status: ApprovalRequestStatus;
};
export type ApprovalRequestViewRow = ApprovalRequestRow & {
  approvalState: ApprovalReviewState;
  isOpen: boolean;
  isResolved: boolean;
};
export type ApprovalRequestInsert = typeof approvalRequests.$inferInsert;

export type ApprovalPublishGuardInput = {
  approvalWorkflowMode: ApprovalWorkflowMode;
  approvalRequestStatus?: string | null;
};

export type ApprovalPublishGuardResult = {
  blocked: boolean;
  requiresApproval: boolean;
  approvalState: ApprovalReviewState;
  reason: string | null;
};

export function isApprovalRequestStatus(value: string | null | undefined): value is ApprovalRequestStatus {
  return Boolean(value && APPROVAL_REQUEST_STATUSES.includes(value as ApprovalRequestStatus));
}

export function normalizeApprovalWorkflowMode(
  value: string | null | undefined
): ApprovalWorkflowMode {
  return value && APPROVAL_WORKFLOW_MODES.includes(value as ApprovalWorkflowMode)
    ? (value as ApprovalWorkflowMode)
    : "none";
}

export function normalizeApprovalReviewState(
  value: string | null | undefined
): ApprovalReviewState {
  return isApprovalRequestStatus(value) ? value : "none";
}

export function normalizeApprovalDecision(
  value: string | null | undefined
): ApprovalDecision | null {
  return value && APPROVAL_DECISIONS.includes(value as ApprovalDecision)
    ? (value as ApprovalDecision)
    : null;
}

export function isApprovalRequestOpen(status: ApprovalRequestStatus) {
  return OPEN_APPROVAL_REQUEST_STATUSES.has(status);
}

export function isApprovalRequestResolved(status: ApprovalRequestStatus) {
  return RESOLVED_APPROVAL_REQUEST_STATUSES.has(status);
}

export function requiresApprovalBeforePublish(mode: ApprovalWorkflowMode) {
  return mode === "required_internal" || mode === "required_internal_and_client";
}

export function humanizeApprovalRequestStatus(status: ApprovalReviewState) {
  switch (status) {
    case "none":
      return "No approval request";
    case "requested":
      return "Requested";
    case "in_review":
      return "In review";
    case "changes_requested":
      return "Changes requested";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "withdrawn":
      return "Withdrawn";
    case "expired":
      return "Expired";
    default:
      return status;
  }
}

export function humanizeApprovalDecision(decision: ApprovalDecision) {
  switch (decision) {
    case "approved":
      return "Approve";
    case "changes_requested":
      return "Request changes";
    case "rejected":
      return "Reject";
    default:
      return decision;
  }
}

export function shouldBlockPublishForApproval(
  input: ApprovalPublishGuardInput
): ApprovalPublishGuardResult {
  const approvalState = normalizeApprovalReviewState(input.approvalRequestStatus);
  const requiresApproval = requiresApprovalBeforePublish(input.approvalWorkflowMode);

  if (!requiresApproval) {
    return {
      blocked: false,
      requiresApproval: false,
      approvalState,
      reason: null,
    };
  }

  if (approvalState === "approved") {
    return {
      blocked: false,
      requiresApproval: true,
      approvalState,
      reason: null,
    };
  }

  return {
    blocked: true,
    requiresApproval: true,
    approvalState,
    reason:
      approvalState === "none"
        ? "Approval required before publish."
        : `${humanizeApprovalRequestStatus(approvalState)} before publish.`,
  };
}

export function mapApprovalRequestRow(row: ApprovalRequestRow): ApprovalRequestViewRow {
  const approvalState = normalizeApprovalReviewState(row.status);
  const approvalRequestStatus = isApprovalRequestStatus(approvalState)
    ? approvalState
    : "requested";

  return {
    ...row,
    approvalState,
    isOpen: isApprovalRequestOpen(approvalRequestStatus),
    isResolved: isApprovalRequestResolved(approvalRequestStatus),
  };
}
