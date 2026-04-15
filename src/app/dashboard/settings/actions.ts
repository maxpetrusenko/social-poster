"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { sendWorkspaceInvitationEmail } from "@/lib/mail";
import { getRequestAppUrl } from "@/lib/app-url";
import {
  acceptInvitationByToken,
  cancelOrganizationDeletion,
  createInvitation,
  createWorkspaceForCurrentOrg,
  ORG_ROLE_OPTIONS,
  removeMemberFromOrganization,
  resendInvitation,
  restoreWorkspace,
  revokeInvitation,
  switchCurrentWorkspace,
  updateCurrentWorkspaceGeneral,
  updateMemberOrgRole,
  updateMemberWorkspaceAssignments,
  updateOrganizationGeneral,
  WORKSPACE_ROLE_OPTIONS,
  type OrgRole,
  type ApprovalWorkflowMode,
  type WorkspaceRole,
  archiveWorkspace,
  deleteWorkspace,
  scheduleOrganizationDeletion,
  requireTenantContext,
} from "@/lib/tenancy";

function parseAssignments(
  formData: FormData,
  workspaceIds: string[]
): Array<{ workspaceId: string; role: WorkspaceRole }> {
  return workspaceIds.flatMap((workspaceId) => {
    if (!formData.get(`ws_${workspaceId}`)) {
      return [];
    }

    const roleValue = String(formData.get(`ws_role_${workspaceId}`) ?? "viewer");
    const role = WORKSPACE_ROLE_OPTIONS.includes(roleValue as WorkspaceRole)
      ? (roleValue as WorkspaceRole)
      : "viewer";

    return [{ workspaceId, role }];
  });
}

function parseHashtagList(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function revalidateSettingsSurfaces() {
  revalidatePath("/dashboard/settings/general");
  revalidatePath("/dashboard/settings/workspaces");
  revalidatePath("/dashboard/settings/team-members");
  revalidatePath("/dashboard/workspace-settings/general");
  revalidatePath("/dashboard/workspace-settings/approvals");
  revalidatePath("/dashboard/workspace-settings/social-accounts");
  revalidatePath("/dashboard");
}

function redirectToTeamMembers(status: string) {
  redirect(`/dashboard/settings/team-members?status=${encodeURIComponent(status)}`);
}

async function getActionAppUrl() {
  return getRequestAppUrl({
    headers: await headers(),
  });
}

export async function updateOrganizationGeneralAction(formData: FormData) {
  await updateOrganizationGeneral({
    name: String(formData.get("name") ?? ""),
    defaultTimezone: String(formData.get("defaultTimezone") ?? ""),
  });

  revalidateSettingsSurfaces();
}

export async function scheduleOrganizationDeletionAction() {
  await scheduleOrganizationDeletion();
  revalidateSettingsSurfaces();
}

export async function cancelOrganizationDeletionAction() {
  await cancelOrganizationDeletion();
  revalidateSettingsSurfaces();
}

export async function createWorkspaceAction(formData: FormData) {
  const workspaceId = await createWorkspaceForCurrentOrg(
    String(formData.get("name") ?? "")
  );

  revalidateSettingsSurfaces();
  redirect(`/dashboard/workspace-settings/general?workspace=${workspaceId}`);
}

export async function switchWorkspaceAction(formData: FormData) {
  const workspaceId = String(formData.get("workspaceId") ?? "");
  await switchCurrentWorkspace(workspaceId);
  revalidateSettingsSurfaces();
  redirect("/dashboard/workspace-settings/general");
}

export async function archiveWorkspaceAction(formData: FormData) {
  await archiveWorkspace(String(formData.get("workspaceId") ?? ""));
  revalidateSettingsSurfaces();
}

export async function restoreWorkspaceAction(formData: FormData) {
  await restoreWorkspace(String(formData.get("workspaceId") ?? ""));
  revalidateSettingsSurfaces();
}

export async function deleteWorkspaceAction(formData: FormData) {
  await deleteWorkspace(String(formData.get("workspaceId") ?? ""));
  revalidateSettingsSurfaces();
}

export async function updateCurrentWorkspaceGeneralAction(formData: FormData) {
  await updateCurrentWorkspaceGeneral({
    name: String(formData.get("name") ?? ""),
    description: String(formData.get("description") ?? ""),
    timezone: String(formData.get("timezone") ?? ""),
    primaryColor: String(formData.get("primaryColor") ?? ""),
    secondaryColor: String(formData.get("secondaryColor") ?? ""),
    defaultHashtags: parseHashtagList(String(formData.get("defaultHashtags") ?? "")),
    defaultFirstComment: String(formData.get("defaultFirstComment") ?? ""),
    approvalWorkflowMode: String(
      formData.get("approvalWorkflowMode") ?? "none"
    ) as ApprovalWorkflowMode,
  });

  revalidateSettingsSurfaces();
}

export async function inviteMemberAction(formData: FormData) {
  const context = await requireTenantContext();
  const baseUrl = await getActionAppUrl();
  const workspaceIds = context.accessibleWorkspaces.map((entry) => entry.workspace.id);
  const orgRoleValue = String(formData.get("orgRole") ?? "member");
  const orgRole = ORG_ROLE_OPTIONS.includes(orgRoleValue as OrgRole)
    ? (orgRoleValue as OrgRole)
    : "member";

  const invite = await createInvitation({
    email: String(formData.get("email") ?? ""),
    orgRole,
    workspaceAssignments: parseAssignments(formData, workspaceIds),
  });

  let status = "invite-sent";
  try {
    await sendWorkspaceInvitationEmail({
      email: invite.email,
      token: invite.token,
      organizationName: context.organization.name,
      inviterName: context.user.fullName ?? context.user.email,
      baseUrl,
    });
  } catch (error) {
    status = "invite-delivery-failed";
    console.error("Failed to deliver workspace invitation email", error);
  }
  revalidateSettingsSurfaces();
  redirectToTeamMembers(status);
}

export async function resendInvitationAction(formData: FormData) {
  const context = await requireTenantContext();
  const baseUrl = await getActionAppUrl();
  const invitation = await resendInvitation(String(formData.get("invitationId") ?? ""));

  let status = "invite-resent";
  try {
    await sendWorkspaceInvitationEmail({
      email: invitation.email,
      token: invitation.token,
      organizationName: context.organization.name,
      inviterName: context.user.fullName ?? context.user.email,
      baseUrl,
    });
  } catch (error) {
    status = "invite-resend-delivery-failed";
    console.error("Failed to resend workspace invitation email", error);
  }
  revalidateSettingsSurfaces();
  redirectToTeamMembers(status);
}

export async function revokeInvitationAction(formData: FormData) {
  await revokeInvitation(String(formData.get("invitationId") ?? ""));
  revalidateSettingsSurfaces();
}

export async function updateMemberOrgRoleAction(formData: FormData) {
  const orgRoleValue = String(formData.get("orgRole") ?? "member");
  const orgRole = ORG_ROLE_OPTIONS.includes(orgRoleValue as OrgRole)
    ? (orgRoleValue as OrgRole)
    : "member";

  await updateMemberOrgRole(String(formData.get("membershipId") ?? ""), orgRole);
  revalidateSettingsSurfaces();
}

export async function updateMemberWorkspaceAssignmentsAction(formData: FormData) {
  const context = await requireTenantContext();
  const workspaceIds = context.accessibleWorkspaces.map((entry) => entry.workspace.id);

  await updateMemberWorkspaceAssignments(
    String(formData.get("userId") ?? ""),
    parseAssignments(formData, workspaceIds)
  );

  revalidateSettingsSurfaces();
}

export async function removeMemberAction(formData: FormData) {
  await removeMemberFromOrganization(String(formData.get("membershipId") ?? ""));
  revalidateSettingsSurfaces();
}

export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  await acceptInvitationByToken(token);
  revalidateSettingsSurfaces();
  redirect("/dashboard");
}
