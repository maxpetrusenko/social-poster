import { redirect } from "next/navigation";
import { TeamMembersPanel } from "@/components/dashboard/team-settings-panels";
import {
  formatWorkspaceAssignments,
  getOrgMembersData,
  type WorkspaceRole,
} from "@/lib/tenancy";
import { getAppUrlFromEnv } from "@/lib/app-url";

export const dynamic = "force-dynamic";

function formatDateLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

function getTeamMembersNotice(status: string | null) {
  switch (status) {
    case "invite-sent":
      return {
        tone: "good" as const,
        title: "invite sent",
        description: "Provider accepted the invite email.",
      };
    case "invite-delivery-failed":
      return {
        tone: "warn" as const,
        title: "invite saved; email blocked",
        description:
          "The pending invite still exists below. Copy the accept link while Resend or SMTP is being fixed.",
      };
    case "invite-resent":
      return {
        tone: "good" as const,
        title: "invite resent",
        description: "A fresh invite email was submitted to the provider.",
      };
    case "invite-resend-delivery-failed":
      return {
        tone: "warn" as const,
        title: "invite refreshed; email blocked",
        description:
          "The pending invite token was rotated. Copy the updated accept link below while delivery is unavailable.",
      };
    default:
      return null;
  }
}

export default async function SettingsTeamMembersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    const params = searchParams ? await searchParams : {};
    const rawStatus = params.status;
    const status = typeof rawStatus === "string" ? rawStatus : null;
    const { context, members, workspaces, workspaceMemberships, invitations } =
      await getOrgMembersData();
    const appUrl = getAppUrlFromEnv();

    const assignmentsByUserId = new Map<
      string,
      Array<{ workspaceId: string; role: WorkspaceRole }>
    >();

    for (const row of workspaceMemberships) {
      const current = assignmentsByUserId.get(row.membership.userId) ?? [];
      current.push({
        workspaceId: row.workspace.id,
        role: row.membership.workspaceRole as WorkspaceRole,
      });
      assignmentsByUserId.set(row.membership.userId, current);
    }

    return (
      <TeamMembersPanel
        workspaces={workspaces
          .filter((workspace) => !workspace.isArchived)
          .map((workspace) => ({ id: workspace.id, name: workspace.name }))}
        members={members
          .sort((left, right) => left.user.email.localeCompare(right.user.email))
          .map((row) => ({
            membershipId: row.membership.id,
            userId: row.user.id,
            name: row.user.fullName ?? row.user.email,
            email: row.user.email,
            orgRole: row.membership.orgRole as "owner" | "admin" | "member",
            isCurrentUser: row.user.id === context.user.id,
            workspaceAssignments:
              assignmentsByUserId
                .get(row.user.id)
                ?.filter((assignment) =>
                  workspaces.some(
                    (workspace) =>
                      workspace.id === assignment.workspaceId &&
                      !workspace.isArchived
                  )
                ) ?? [],
          }))}
        invitations={invitations.map((invite) => ({
          id: invite.id,
          email: invite.email,
          orgRole: invite.orgRole as "owner" | "admin" | "member",
          createdAtLabel: formatDateLabel(invite.createdAt),
          expiresAtLabel: formatDateLabel(invite.expiresAt),
          url: `${appUrl}/invite/${invite.token}`,
          assignments: formatWorkspaceAssignments(invite.workspaceAssignments, workspaces).map(
            (assignment) => ({
              workspaceId: assignment.workspaceId,
              workspaceName: assignment.workspaceName,
              role: assignment.role as
                | "owner"
                | "manager"
                | "editor"
                | "contributor"
                | "client"
                | "viewer",
            })
          ),
        }))}
        notice={getTeamMembersNotice(status)}
      />
    );
  } catch {
    redirect("/login");
  }
}
