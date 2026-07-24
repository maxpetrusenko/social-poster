import { redirect } from "next/navigation";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { InvitationAcceptPanel } from "@/components/dashboard/team-settings-panels";
import { db } from "@/db";
import { organizations, workspaceInvitations, workspaces } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invitation = await db
    .select({
      invitation: workspaceInvitations,
      organization: organizations,
    })
    .from(workspaceInvitations)
    .innerJoin(
      organizations,
      eq(workspaceInvitations.organizationId, organizations.id)
    )
    .where(
      and(
        eq(workspaceInvitations.token, token),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, new Date())
      )
    )
    .get();

  if (!invitation) {
    redirect("/login?error=invalid_or_expired");
  }

  const session = await getSession();
  const assignmentIds =
    invitation.invitation.workspaceAssignments?.map(
      (assignment) => assignment.workspaceId
    ) ?? [];

  const workspaceRows = assignmentIds.length
    ? await db
        .select()
        .from(workspaces)
        .where(inArray(workspaces.id, assignmentIds))
    : [];
  const workspaceNameById = new Map(
    workspaceRows.map((workspace) => [workspace.id, workspace.name])
  );
  const loginHref = `/login?next=${encodeURIComponent(`/invite/${token}`)}`;
  const canAccept =
    session?.email?.trim().toLowerCase() ===
    invitation.invitation.email.trim().toLowerCase();
  const switchAccountHref =
    session && !canAccept
      ? `/api/auth/logout?next=${encodeURIComponent(`/invite/${token}`)}`
      : null;

  return (
    <InvitationAcceptPanel
      organizationName={invitation.organization.name}
      email={invitation.invitation.email}
      token={token}
      canAccept={canAccept}
      loginHref={loginHref}
      switchAccountHref={switchAccountHref}
      assignments={(invitation.invitation.workspaceAssignments ?? []).map(
        (assignment) => ({
          workspaceName:
            workspaceNameById.get(assignment.workspaceId) ?? "Unknown workspace",
          role: assignment.role as
            | "owner"
            | "manager"
            | "editor"
            | "contributor"
            | "client"
            | "viewer",
        })
      )}
    />
  );
}
