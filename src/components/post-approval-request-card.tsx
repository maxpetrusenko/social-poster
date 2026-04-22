import { formatDate } from "@/lib/utils";
import {
  humanizeApprovalRequestStatus,
  type ApprovalRequestViewRow,
} from "@/lib/approvals";
import { PostApprovalRequestButton } from "@/components/post-approval-request-button";
import { PostApprovalRequestActions } from "@/components/post-approval-request-actions";

type Props = {
  postId: string;
  approvalWorkflowMode: string;
  latestApprovalRequest: ApprovalRequestViewRow | null;
};

export function PostApprovalRequestCard({
  postId,
  approvalWorkflowMode,
  latestApprovalRequest,
}: Props) {
  const status = latestApprovalRequest?.approvalState ?? "none";
  const isDisabled = approvalWorkflowMode === "none";

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Approval</h3>
      <div className="space-y-2 text-sm text-gray-700">
        <p>
          Latest status: <span className="font-medium">{humanizeApprovalRequestStatus(status)}</span>
        </p>
        {latestApprovalRequest?.updatedAt ? (
          <p className="text-xs text-gray-600">
            Updated: {formatDate(latestApprovalRequest.updatedAt)}
          </p>
        ) : null}
        {isDisabled ? (
          <p className="text-xs text-gray-600">
            This workspace has approval workflow disabled.
          </p>
        ) : latestApprovalRequest?.isOpen ? (
          <PostApprovalRequestActions postId={postId} />
        ) : (
          <PostApprovalRequestButton postId={postId} />
        )}
      </div>
    </div>
  );
}
