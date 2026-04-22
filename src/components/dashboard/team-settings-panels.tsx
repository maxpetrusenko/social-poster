import Link from "next/link";
import {
  DashboardHero,
  HeroButton,
  MetricCard,
  SectionCard,
  StatusBadge,
} from "@/components/dashboard/ui";
import type {
  ApprovalWorkflowMode,
  OrgRole,
  WorkspaceRole,
} from "@/lib/tenancy";
import {
  acceptInvitationAction,
  archiveWorkspaceAction,
  cancelOrganizationDeletionAction,
  createWorkspaceAction,
  deleteWorkspaceAction,
  inviteMemberAction,
  removeMemberAction,
  resendInvitationAction,
  restoreWorkspaceAction,
  scheduleOrganizationDeletionAction,
  switchWorkspaceAction,
  updateCurrentWorkspaceGeneralAction,
  updateMemberOrgRoleAction,
  updateMemberWorkspaceAssignmentsAction,
  updateOrganizationGeneralAction,
  revokeInvitationAction,
} from "@/app/dashboard/settings/actions";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "UTC",
] as const;

const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  manager: "Manager",
  editor: "Editor",
  contributor: "Contributor",
  client: "Client",
  viewer: "Viewer",
};

const APPROVAL_LABELS: Record<ApprovalWorkflowMode, string> = {
  none: "None",
  optional: "Optional",
  required_internal: "Required internal",
  required_internal_and_client: "Internal plus client",
};

type WorkspaceSurface = {
  id: string;
  name: string;
  description: string;
  effectiveTimezone: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  approvalWorkflowMode: ApprovalWorkflowMode;
  defaultHashtags: string[];
  defaultFirstComment: string;
  isArchived: boolean;
  memberCount: number;
  canManage: boolean;
  canDelete?: boolean;
};

type MemberSurface = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  orgRole: OrgRole;
  isCurrentUser: boolean;
  workspaceAssignments: Array<{ workspaceId: string; role: WorkspaceRole }>;
};

type InvitationSurface = {
  id: string;
  email: string;
  orgRole: OrgRole;
  createdAtLabel: string;
  expiresAtLabel: string;
  url: string;
  assignments: Array<{ workspaceId: string; workspaceName: string; role: WorkspaceRole }>;
};

type TeamMembersNotice = {
  tone: "good" | "warn";
  title: string;
  description: string;
};

export function OrganizationSettingsPanel({
  organizationName,
  defaultTimezone,
  workspaceCount,
  memberCount,
  deletionScheduledForLabel,
}: {
  organizationName: string;
  defaultTimezone: string;
  workspaceCount: number;
  memberCount: number;
  deletionScheduledForLabel: string | null;
}) {
  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Settings / General"
        title="Organization identity and defaults"
        description="BrightBean parity: real org settings, timezone, workspace count, and deletion controls instead of shell copy."
        actions={
          <>
            <HeroButton href="/dashboard/settings/workspaces" tone="ghost">
              Workspaces
            </HeroButton>
            <HeroButton href="/dashboard/settings/team-members">
              Team Members
            </HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Workspaces" value={workspaceCount} sub="Active + archived containers." />
        <MetricCard label="Members" value={memberCount} sub="Accepted org seats." accent="#d86d36" />
        <MetricCard label="Timezone" value={defaultTimezone} sub="Org fallback for workspace schedules." accent="#0c5f6b" />
      </div>

      <SectionCard title="Organization Details" subtitle="Name and default timezone drive the org shell and workspace fallbacks.">
        <form action={updateOrganizationGeneralAction} className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Name</span>
            <input
              name="name"
              required
              defaultValue={organizationName}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Default timezone</span>
            <input
              name="defaultTimezone"
              list="common-timezones"
              defaultValue={defaultTimezone}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <div className="lg:col-span-2 flex justify-end">
            <button className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white">
              Save organization settings
            </button>
          </div>
        </form>
        <datalist id="common-timezones">
          {COMMON_TIMEZONES.map((timezone) => (
            <option key={timezone} value={timezone} />
          ))}
        </datalist>
      </SectionCard>

      <SectionCard title="Destructive Controls" subtitle="Matches BrightBean: queued org deletion with an owner-only cancel path.">
        <div className="flex flex-col gap-4 rounded-[18px] border border-[rgba(216,109,54,0.18)] bg-[rgba(255,244,239,0.9)] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={deletionScheduledForLabel ? "warn" : "neutral"}>
              {deletionScheduledForLabel ? "deletion pending" : "stable"}
            </StatusBadge>
            <p className="text-sm text-[var(--muted)]">
              {deletionScheduledForLabel
                ? `Scheduled for ${deletionScheduledForLabel}.`
                : "No deletion is queued."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <form action={scheduleOrganizationDeletionAction}>
              <button className="rounded-[14px] border border-[rgba(216,109,54,0.28)] bg-white px-4 py-3 text-sm font-semibold text-[#a84e26]">
                Schedule deletion
              </button>
            </form>
            {deletionScheduledForLabel ? (
              <form action={cancelOrganizationDeletionAction}>
                <button className="rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm font-semibold text-[var(--ink)]">
                  Cancel deletion
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export function WorkspaceControlPlane({
  currentWorkspaceId,
  workspaces,
}: {
  currentWorkspaceId: string;
  workspaces: WorkspaceSurface[];
}) {
  const activeCount = workspaces.filter((workspace) => !workspace.isArchived).length;

  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Settings / Workspaces"
        title="Workspace control plane"
        description="Create, switch, archive, restore, and inspect the exact workspace shell BrightBean exposes."
        actions={
          <>
            <HeroButton href="/dashboard/settings/team-members" tone="ghost">
              Team Members
            </HeroButton>
            <HeroButton href="/dashboard/workspace-settings/general">
              Current Workspace
            </HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total" value={workspaces.length} sub="All workspace containers in the org." />
        <MetricCard label="Active" value={activeCount} sub="Live workspaces in rotation." accent="#0c5f6b" />
        <MetricCard label="Archived" value={workspaces.length - activeCount} sub="Restorable history shells." accent="#d86d36" />
      </div>

      <SectionCard title="Create Workspace" subtitle="New workspace becomes current immediately and lands inside workspace settings.">
        <form action={createWorkspaceAction} className="flex flex-col gap-4 md:flex-row">
          <input
            name="name"
            required
            placeholder="Orbit client workspace"
            className="min-w-0 flex-1 rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
          />
          <button className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white">
            Create workspace
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Workspace List" subtitle="Open sets current workspace. Archive and delete follow BrightBean guardrails.">
        <div className="space-y-4">
          {workspaces.map((workspace) => (
            <article
              key={workspace.id}
              className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-[var(--ink)]">
                      {workspace.name}
                    </p>
                    {workspace.id === currentWorkspaceId ? (
                      <StatusBadge tone="good">current</StatusBadge>
                    ) : null}
                    <StatusBadge tone={workspace.isArchived ? "warn" : "neutral"}>
                      {workspace.isArchived ? "archived" : "active"}
                    </StatusBadge>
                  </div>
                  <p className="text-sm leading-6 text-[var(--muted)]">
                    {workspace.description || "No workspace description yet."}
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs text-[var(--muted)]">
                    <span>{workspace.effectiveTimezone}</span>
                    <span>{workspace.memberCount} members</span>
                    <span>{APPROVAL_LABELS[workspace.approvalWorkflowMode]}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={switchWorkspaceAction}>
                    <input type="hidden" name="workspaceId" value={workspace.id} />
                    <button className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                      Open workspace
                    </button>
                  </form>
                  {workspace.canManage ? (
                    <>
                      {!workspace.isArchived ? (
                        <form action={archiveWorkspaceAction}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <button className="rounded-[12px] border border-[rgba(216,109,54,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[#a84e26]">
                            Archive
                          </button>
                        </form>
                      ) : (
                        <form action={restoreWorkspaceAction}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <button className="rounded-[12px] border border-[rgba(12,95,107,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[#0c5f6b]">
                            Restore
                          </button>
                        </form>
                      )}
                      {workspace.canDelete ? (
                        <form action={deleteWorkspaceAction}>
                          <input type="hidden" name="workspaceId" value={workspace.id} />
                          <button className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--muted)]">
                            Delete
                          </button>
                        </form>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

export function TeamMembersPanel({
  members,
  invitations,
  workspaces,
  notice,
}: {
  members: MemberSurface[];
  invitations: InvitationSurface[];
  workspaces: Array<{ id: string; name: string }>;
  notice?: TeamMembersNotice | null;
}) {
  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Settings / Team Members"
        title="Members, roles, and workspace access"
        description="Invite, resend, revoke, adjust org role, set workspace roles, and remove seats from one place."
        actions={
          <>
            <HeroButton href="/dashboard/settings/workspaces" tone="ghost">
              Workspaces
            </HeroButton>
            <HeroButton href="/dashboard/workspace-settings/general">
              Workspace Settings
            </HeroButton>
          </>
        }
      />

      {notice ? (
        <section
          className={`rounded-[24px] border px-5 py-4 shadow-[0_18px_45px_rgba(12,17,21,0.08)] ${
            notice.tone === "good"
              ? "border-emerald-200 bg-emerald-50/90"
              : "border-amber-200 bg-amber-50/90"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tone={notice.tone}>{notice.title}</StatusBadge>
            <p className="text-sm text-[var(--ink)]">{notice.description}</p>
          </div>
        </section>
      ) : null}

      <SectionCard title="Invite Member" subtitle="Org role plus per-workspace access in one submission.">
        <form action={inviteMemberAction} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Email</span>
            <input
              name="email"
              type="email"
              required
              placeholder="teammate@example.com"
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Org role</span>
            <select
              name="orgRole"
              defaultValue="member"
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            >
              {Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div className="lg:col-span-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workspaces.map((workspace) => (
              <div
                key={workspace.id}
                className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
              >
                <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                  <input type="checkbox" name={`ws_${workspace.id}`} />
                  {workspace.name}
                </label>
                <select
                  name={`ws_role_${workspace.id}`}
                  defaultValue="viewer"
                  className="mt-3 w-full rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm outline-none"
                >
                  {Object.entries(WORKSPACE_ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="lg:col-span-2 flex justify-end">
            <button className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white">
              Send invite
            </button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="Members" subtitle="Each member row owns org role, workspace assignments, and removal.">
        <div className="space-y-4">
          {members.map((member) => (
            <article
              key={member.membershipId}
              className="rounded-[20px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-[var(--ink)]">
                      {member.name}
                    </p>
                    {member.isCurrentUser ? (
                      <StatusBadge tone="good">you</StatusBadge>
                    ) : null}
                    <StatusBadge tone="neutral">
                      {ORG_ROLE_LABELS[member.orgRole]}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--muted)]">{member.email}</p>
                </div>

                <form action={updateMemberOrgRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="membershipId" value={member.membershipId} />
                  <select
                    name="orgRole"
                    defaultValue={member.orgRole}
                    className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm outline-none"
                  >
                    {Object.entries(ORG_ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                    Save role
                  </button>
                </form>
              </div>

              <form action={updateMemberWorkspaceAssignmentsAction} className="mt-4 space-y-4">
                <input type="hidden" name="userId" value={member.userId} />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {workspaces.map((workspace) => {
                    const assigned = member.workspaceAssignments.find(
                      (entry) => entry.workspaceId === workspace.id
                    );

                    return (
                      <div
                        key={workspace.id}
                        className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-white p-4"
                      >
                        <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                          <input
                            type="checkbox"
                            name={`ws_${workspace.id}`}
                            defaultChecked={Boolean(assigned)}
                          />
                          {workspace.name}
                        </label>
                        <select
                          name={`ws_role_${workspace.id}`}
                          defaultValue={assigned?.role ?? "viewer"}
                          className="mt-3 w-full rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm outline-none"
                        >
                          {Object.entries(WORKSPACE_ROLE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                    Save access
                  </button>
                  {!member.isCurrentUser ? (
                    <button
                      formAction={removeMemberAction}
                      name="membershipId"
                      value={member.membershipId}
                      className="rounded-[12px] border border-[rgba(216,109,54,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[#a84e26]"
                    >
                      Remove member
                    </button>
                  ) : null}
                </div>
              </form>
            </article>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Pending Invites" subtitle="Resend, revoke, or copy the accept URL when SMTP is off.">
        {invitations.length === 0 ? (
          <div className="rounded-[18px] border border-dashed border-[rgba(12,17,21,0.12)] px-4 py-10 text-center text-sm text-[var(--muted)]">
            No pending invites.
          </div>
        ) : (
          <div className="space-y-4">
            {invitations.map((invite) => (
              <article
                key={invite.id}
                className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-[var(--ink)]">
                        {invite.email}
                      </p>
                      <StatusBadge tone="warn">{ORG_ROLE_LABELS[invite.orgRole]}</StatusBadge>
                    </div>
                    <p className="text-sm text-[var(--muted)]">
                      Sent {invite.createdAtLabel}. Expires {invite.expiresAtLabel}.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {invite.assignments.map((assignment) => (
                        <span
                          key={`${invite.id}-${assignment.workspaceId}`}
                          className="rounded-full bg-[#f5f3ef] px-3 py-1 text-xs font-medium text-[#756756]"
                        >
                          {assignment.workspaceName}: {WORKSPACE_ROLE_LABELS[assignment.role]}
                        </span>
                      ))}
                    </div>
                    <Link href={invite.url} className="block break-all text-xs text-[var(--accent-tech)]">
                      {invite.url}
                    </Link>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={resendInvitationAction}>
                      <input type="hidden" name="invitationId" value={invite.id} />
                      <button className="rounded-[12px] border border-[rgba(12,17,21,0.12)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)]">
                        Resend
                      </button>
                    </form>
                    <form action={revokeInvitationAction}>
                      <input type="hidden" name="invitationId" value={invite.id} />
                      <button className="rounded-[12px] border border-[rgba(216,109,54,0.22)] bg-white px-3 py-2 text-sm font-semibold text-[#a84e26]">
                        Revoke
                      </button>
                    </form>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export function CurrentWorkspaceSettingsPanel({
  workspace,
  socialAccountsHref = "/dashboard/workspace-settings/social-accounts",
}: {
  workspace: WorkspaceSurface;
  socialAccountsHref?: string;
}) {
  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Workspace Settings / General"
        title={workspace.name}
        description="Brand identity, timezone, color system, hashtags, and local posting defaults live here now."
        actions={
          <>
            <HeroButton href="/dashboard/settings/workspaces" tone="ghost">
              Workspaces
            </HeroButton>
            <HeroButton href={socialAccountsHref}>Social Accounts</HeroButton>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Timezone" value={workspace.effectiveTimezone} sub="Used for local scheduling and defaults." />
        <MetricCard label="Members" value={workspace.memberCount} sub="Active seats with workspace access." accent={workspace.primaryColor || "#d86d36"} />
        <MetricCard label="Approval" value={APPROVAL_LABELS[workspace.approvalWorkflowMode]} sub="Current review mode." accent={workspace.secondaryColor || "#0c5f6b"} />
      </div>

      <SectionCard title="Workspace General" subtitle="Matches BrightBean general settings: name, timezone, colors, hashtags, first comment.">
        <form action={updateCurrentWorkspaceGeneralAction} className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Name</span>
            <input
              name="name"
              required
              defaultValue={workspace.name}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Timezone</span>
            <input
              name="timezone"
              list="common-timezones"
              defaultValue={workspace.timezone}
              placeholder={workspace.effectiveTimezone}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)] lg:col-span-2">
            <span>Description</span>
            <textarea
              name="description"
              defaultValue={workspace.description}
              rows={3}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Primary color</span>
            <input
              name="primaryColor"
              defaultValue={workspace.primaryColor}
              placeholder="#d86d36"
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)]">
            <span>Secondary color</span>
            <input
              name="secondaryColor"
              defaultValue={workspace.secondaryColor}
              placeholder="#0c5f6b"
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)] lg:col-span-2">
            <span>Default hashtags</span>
            <textarea
              name="defaultHashtags"
              defaultValue={workspace.defaultHashtags.join(", ")}
              rows={2}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--ink)] lg:col-span-2">
            <span>Default first comment</span>
            <textarea
              name="defaultFirstComment"
              defaultValue={workspace.defaultFirstComment}
              rows={4}
              className="w-full rounded-[14px] border border-[rgba(12,17,21,0.12)] bg-white px-4 py-3 text-sm outline-none"
            />
          </label>
          <div className="lg:col-span-2 flex justify-end">
            <button className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white">
              Save workspace settings
            </button>
          </div>
        </form>
        <datalist id="common-timezones">
          {COMMON_TIMEZONES.map((timezone) => (
            <option key={timezone} value={timezone} />
          ))}
        </datalist>
      </SectionCard>
    </div>
  );
}

export function ApprovalSettingsPanel({
  workspace,
}: {
  workspace: WorkspaceSurface;
}) {
  return (
    <div className="space-y-6">
      <DashboardHero
        eyebrow="Workspace Settings / Approvals"
        title="Approval rules and reminders"
        description="This port keeps the BrightBean approval mode model, stored on the workspace and shared with the client-portal flow."
        actions={
          <HeroButton href="/dashboard/publish">Publish Shell</HeroButton>
        }
      />

      <SectionCard title="Approval Workflow" subtitle="Mode is durable now and shared across workspace settings, member access, and later client review.">
        <form action={updateCurrentWorkspaceGeneralAction} className="space-y-4">
          <input type="hidden" name="name" value={workspace.name} />
          <input type="hidden" name="description" value={workspace.description} />
          <input type="hidden" name="timezone" value={workspace.timezone} />
          <input type="hidden" name="primaryColor" value={workspace.primaryColor} />
          <input type="hidden" name="secondaryColor" value={workspace.secondaryColor} />
          <input type="hidden" name="defaultHashtags" value={workspace.defaultHashtags.join(", ")} />
          <input type="hidden" name="defaultFirstComment" value={workspace.defaultFirstComment} />
          <div className="grid gap-3 lg:grid-cols-2">
            {Object.entries(APPROVAL_LABELS).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
              >
                <input
                  type="radio"
                  name="approvalWorkflowMode"
                  value={value}
                  defaultChecked={workspace.approvalWorkflowMode === value}
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--ink)]">
                    {label}
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">
                    {value === "none"
                      ? "Publish can go straight through without review."
                      : value === "optional"
                        ? "Operators can request review when a post needs it."
                        : value === "required_internal"
                          ? "Internal approval is mandatory before publish."
                          : "Internal approval plus client approval before publish."}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button className="rounded-[14px] bg-[#171717] px-4 py-3 text-sm font-semibold text-white">
              Save approval mode
            </button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

export function InvitationAcceptPanel({
  organizationName,
  email,
  assignments,
  token,
  canAccept,
  loginHref,
}: {
  organizationName: string;
  email: string;
  assignments: Array<{ workspaceName: string; role: WorkspaceRole }>;
  token: string;
  canAccept: boolean;
  loginHref: string;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 md:px-6">
      <DashboardHero
        eyebrow="Invite"
        title={`Join ${organizationName}`}
        description="Review workspace access, then accept the invitation into the dashboard."
        actions={
          canAccept ? (
            <form action={acceptInvitationAction}>
              <input type="hidden" name="token" value={token} />
              <button className="rounded-[14px] bg-[var(--paper)] px-5 py-3 text-sm font-semibold text-[var(--ink)] shadow-[0_10px_24px_rgba(12,17,21,0.24)]">
                Accept invite
              </button>
            </form>
          ) : (
            <HeroButton href={loginHref}>Sign in to accept</HeroButton>
          )
        }
      />

      <SectionCard title="Invite Details" subtitle={`Reserved for ${email}. Your sign-in email must match.`}>
        <div className="grid gap-3">
          {assignments.map((assignment) => (
            <div
              key={`${assignment.workspaceName}-${assignment.role}`}
              className="rounded-[18px] border border-[rgba(12,17,21,0.08)] bg-[var(--paper)] p-4"
            >
              <p className="text-base font-semibold text-[var(--ink)]">
                {assignment.workspaceName}
              </p>
              <p className="mt-2 text-sm text-[var(--muted)]">
                {WORKSPACE_ROLE_LABELS[assignment.role]}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
