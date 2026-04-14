import { redirect } from "next/navigation";
import { CurrentWorkspaceSettingsPanel } from "@/components/dashboard/team-settings-panels";
import {
  getOrgMembersData,
  getWorkspaceSummary,
  type ApprovalWorkflowMode,
} from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function WorkspaceSettingsGeneralPage() {
  try {
    const { context, workspaceMemberships } = await getOrgMembersData();
    const memberCount = workspaceMemberships.filter(
      (row) => row.workspace.id === context.currentWorkspace.id
    ).length;

    return (
      <CurrentWorkspaceSettingsPanel
        workspace={{
          ...getWorkspaceSummary(context.currentWorkspace, context.organization),
          approvalWorkflowMode:
            context.currentWorkspace.approvalWorkflowMode as ApprovalWorkflowMode,
          memberCount,
          canManage:
            context.currentWorkspaceMembership.workspaceRole === "owner" ||
            context.currentWorkspaceMembership.workspaceRole === "manager",
        }}
      />
    );
  } catch {
    redirect("/login");
  }
}
