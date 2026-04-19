import { redirect } from "next/navigation";
import { WorkspaceControlPlane } from "@/components/dashboard/team-settings-panels";
import {
  canManageOrganization,
  getOrgMembersData,
  getWorkspaceSummary,
  type ApprovalWorkflowMode,
} from "@/lib/tenancy";

export const dynamic = "force-dynamic";

export default async function SettingsWorkspacesPage() {
  try {
    const { context, workspaces, workspaceMemberships } = await getOrgMembersData();
    if (!canManageOrganization(context)) {
      redirect("/dashboard");
    }
    const memberCountByWorkspaceId = new Map<string, number>();

    for (const row of workspaceMemberships) {
      memberCountByWorkspaceId.set(
        row.workspace.id,
        (memberCountByWorkspaceId.get(row.workspace.id) ?? 0) + 1
      );
    }

    return (
      <WorkspaceControlPlane
        currentWorkspaceId={context.currentWorkspace.id}
        workspaces={workspaces
          .map((workspace) => ({
            ...getWorkspaceSummary(workspace, context.organization),
            approvalWorkflowMode:
              workspace.approvalWorkflowMode as ApprovalWorkflowMode,
            memberCount: memberCountByWorkspaceId.get(workspace.id) ?? 0,
            canManage:
              context.orgMembership.orgRole === "owner" ||
              context.orgMembership.orgRole === "admin" ||
              context.accessibleWorkspaces.some(
                (entry) =>
                  entry.workspace.id === workspace.id &&
                  (entry.membership.workspaceRole === "owner" ||
                    entry.membership.workspaceRole === "manager")
              ),
            canDelete: canManageOrganization(context),
          }))
          .sort((left, right) => {
            if (left.isArchived !== right.isArchived) {
              return left.isArchived ? 1 : -1;
            }
            return left.name.localeCompare(right.name);
          })}
      />
    );
  } catch {
    redirect("/login");
  }
}
