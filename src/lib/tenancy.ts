import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents,
  orgMemberships,
  organizations,
  platforms,
  pipelineRuns,
  profiles,
  posts,
  postTargets,
  replyCandidates,
  replyEvents,
  schedules,
  users,
  workspaceInvitations,
  workspaceMemberships,
  workspaces,
} from "@/db/schema";
import { getSession } from "@/lib/auth";
import { getAppUrlFromEnv } from "@/lib/app-url";
import { INVITE_TTL_DAYS } from "@/lib/invite-config";

export const WORKSPACE_COOKIE = "sp_workspace";

export const ORG_ROLE_OPTIONS = ["owner", "admin", "member"] as const;
export const WORKSPACE_ROLE_OPTIONS = [
  "owner",
  "manager",
  "editor",
  "contributor",
  "client",
  "viewer",
] as const;
export const APPROVAL_WORKFLOW_OPTIONS = [
  "none",
  "optional",
  "required_internal",
  "required_internal_and_client",
] as const;

export type OrgRole = (typeof ORG_ROLE_OPTIONS)[number];
export type WorkspaceRole = (typeof WORKSPACE_ROLE_OPTIONS)[number];
export type ApprovalWorkflowMode =
  (typeof APPROVAL_WORKFLOW_OPTIONS)[number];

type UserRow = typeof users.$inferSelect;
type OrganizationRow = typeof organizations.$inferSelect;
type OrgMembershipRow = typeof orgMemberships.$inferSelect;
type WorkspaceRow = typeof workspaces.$inferSelect;
type WorkspaceMembershipRow = typeof workspaceMemberships.$inferSelect;
type WorkspaceInvitationRow = typeof workspaceInvitations.$inferSelect;
type JoinedOrganizationMembership = {
  organization: OrganizationRow;
  orgMembership: OrgMembershipRow;
};
type TenantInitialization = JoinedOrganizationMembership & {
  user: UserRow;
};

export type TenantWorkspace = {
  workspace: WorkspaceRow;
  membership: WorkspaceMembershipRow;
};

export type TenantContext = {
  session: Awaited<ReturnType<typeof getSession>>;
  user: UserRow;
  organization: OrganizationRow;
  orgMembership: OrgMembershipRow;
  currentWorkspace: WorkspaceRow;
  currentWorkspaceMembership: WorkspaceMembershipRow;
  accessibleWorkspaces: TenantWorkspace[];
};

const ORG_ADMIN_ROLES = new Set<OrgRole>(["owner", "admin"]);
const WORKSPACE_MANAGER_ROLES = new Set<WorkspaceRole>(["owner", "manager"]);
const WORKSPACE_EDITOR_ROLES = new Set<WorkspaceRole>([
  "owner",
  "manager",
  "editor",
  "contributor",
]);
const WORKSPACE_PUBLISHER_ROLES = new Set<WorkspaceRole>([
  "owner",
  "manager",
  "editor",
]);
const tenantCreationLocks = new Map<string, Promise<TenantInitialization>>();

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function canManageOrganization(context: TenantContext) {
  return ORG_ADMIN_ROLES.has(context.orgMembership.orgRole as OrgRole);
}

export function canManageWorkspace(context: TenantContext, workspaceId: string) {
  if (canManageOrganization(context)) {
    return true;
  }

  const membership = context.accessibleWorkspaces.find(
    (entry) => entry.workspace.id === workspaceId
  )?.membership;

  return membership
    ? WORKSPACE_MANAGER_ROLES.has(membership.workspaceRole as WorkspaceRole)
    : false;
}

export function canManageCurrentWorkspace(context: TenantContext) {
  return canManageWorkspace(context, context.currentWorkspace.id);
}

export function canEditCurrentWorkspaceContent(context: TenantContext) {
  if (canManageOrganization(context)) {
    return true;
  }

  return WORKSPACE_EDITOR_ROLES.has(
    context.currentWorkspaceMembership.workspaceRole as WorkspaceRole
  );
}

export function canPublishCurrentWorkspaceContent(context: TenantContext) {
  if (canManageOrganization(context)) {
    return true;
  }

  return WORKSPACE_PUBLISHER_ROLES.has(
    context.currentWorkspaceMembership.workspaceRole as WorkspaceRole
  );
}

function requireOrgAdmin(context: TenantContext) {
  if (!canManageOrganization(context)) {
    throw new Error("Organization admin access is required.");
  }
}

function requireOrgOwner(context: TenantContext) {
  if (context.orgMembership.orgRole !== "owner") {
    throw new Error("Organization owner access is required.");
  }
}

function requireWorkspaceManager(context: TenantContext, workspaceId: string) {
  if (!canManageWorkspace(context, workspaceId)) {
    throw new Error("Workspace manager access is required.");
  }
}

async function recordAuditEvent(
  context: TenantContext,
  input: {
    action: string;
    targetType: string;
    targetId?: string | null;
    workspaceId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    organizationId: context.organization.id,
    workspaceId: input.workspaceId ?? context.currentWorkspace.id,
    actorUserId: context.user.id,
    actorEmail: context.user.email,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    metadata: input.metadata,
    createdAt: new Date(),
  });
}

function titleCase(input: string) {
  return input
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function humanNameFromEmail(email: string) {
  const local = email.split("@")[0] ?? "operator";
  return titleCase(local) || "Operator";
}

function slugify(input: string, fallback = "item") {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return value || fallback;
}

async function organizationSlugExists(slug: string) {
  const row = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .get();

  return Boolean(row);
}

function isSqliteUniqueConstraintError(error: unknown, column: string) {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  const message = error instanceof Error ? error.message : String(error);

  return code === "SQLITE_CONSTRAINT_UNIQUE" && message.includes(column);
}

async function joinedOrganizationForUser(
  userId: string
): Promise<JoinedOrganizationMembership | undefined> {
  const row = await db
    .select({
      organization: organizations,
      membership: orgMemberships,
    })
    .from(orgMemberships)
    .innerJoin(
      organizations,
      eq(orgMemberships.organizationId, organizations.id)
    )
    .where(eq(orgMemberships.userId, userId))
    .get();

  return row
    ? { organization: row.organization, orgMembership: row.membership }
    : undefined;
}

async function workspaceSlugExists(organizationId: string, slug: string) {
  const row = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, organizationId),
        eq(workspaces.slug, slug)
      )
    )
    .get();

  return Boolean(row);
}

async function nextOrganizationSlug(name: string) {
  const base = slugify(name, "organization");

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    if (!(await organizationSlugExists(candidate))) {
      return candidate;
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

async function nextWorkspaceSlug(organizationId: string, name: string) {
  const base = slugify(name, "workspace");

  for (let index = 0; index < 1000; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`;
    if (!(await workspaceSlugExists(organizationId, candidate))) {
      return candidate;
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

function effectiveWorkspaceTimezone(
  workspace: WorkspaceRow,
  organization: OrganizationRow
) {
  return workspace.timezone || organization.defaultTimezone || "UTC";
}

async function ensureLegacyPlatformsBound(workspaceId: string) {
  const unbound = await db
    .select({ id: platforms.id })
    .from(platforms)
    .where(isNull(platforms.workspaceId));

  if (!unbound.length) {
    return;
  }

  await db
    .update(platforms)
    .set({ workspaceId })
    .where(isNull(platforms.workspaceId));
}

async function ensureLegacyProfilesBound(workspaceId: string) {
  const unbound = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(isNull(profiles.workspaceId));

  if (!unbound.length) {
    return;
  }

  await db
    .update(profiles)
    .set({ workspaceId })
    .where(isNull(profiles.workspaceId));
}

async function firstWorkspaceIdForPost(postId: string) {
  const targets = await db
    .select({
      workspaceId: platforms.workspaceId,
    })
    .from(postTargets)
    .innerJoin(platforms, eq(postTargets.platformId, platforms.id))
    .where(eq(postTargets.postId, postId));

  return targets.find((row) => row.workspaceId)?.workspaceId ?? null;
}

async function firstWorkspaceIdForSchedule(scheduleId: string) {
  const schedule = await db
    .select()
    .from(schedules)
    .where(eq(schedules.id, scheduleId))
    .get();

  if (!schedule) {
    return null;
  }

  for (const platformId of schedule.targetPlatformIds ?? []) {
    const platform = await db
      .select({ workspaceId: platforms.workspaceId })
      .from(platforms)
      .where(eq(platforms.id, platformId))
      .get();

    if (platform?.workspaceId) {
      return platform.workspaceId;
    }
  }

  return null;
}

async function ensureLegacyWorkspaceBindings(defaultWorkspaceId: string) {
  await ensureLegacyPlatformsBound(defaultWorkspaceId);
  await ensureLegacyProfilesBound(defaultWorkspaceId);

  const unboundPosts = await db
    .select({ id: posts.id })
    .from(posts)
    .where(isNull(posts.workspaceId));
  for (const row of unboundPosts) {
    const workspaceId = (await firstWorkspaceIdForPost(row.id)) ?? defaultWorkspaceId;
    await db
      .update(posts)
      .set({ workspaceId })
      .where(eq(posts.id, row.id));
  }

  const unboundSchedules = await db
    .select({ id: schedules.id })
    .from(schedules)
    .where(isNull(schedules.workspaceId));
  for (const row of unboundSchedules) {
    const workspaceId = (await firstWorkspaceIdForSchedule(row.id)) ?? defaultWorkspaceId;
    await db
      .update(schedules)
      .set({ workspaceId })
      .where(eq(schedules.id, row.id));
  }

  const scheduleRows = await db
    .select({ id: schedules.id, workspaceId: schedules.workspaceId })
    .from(schedules);
  const postRows = await db
    .select({ id: posts.id, workspaceId: posts.workspaceId })
    .from(posts);
  const platformRows = await db
    .select({ id: platforms.id, workspaceId: platforms.workspaceId })
    .from(platforms);
  const scheduleWorkspaceById = new Map(
    scheduleRows.map((row) => [row.id, row.workspaceId])
  );
  const postWorkspaceById = new Map(postRows.map((row) => [row.id, row.workspaceId]));
  const platformWorkspaceById = new Map(
    platformRows.map((row) => [row.id, row.workspaceId])
  );

  const unboundRuns = await db
    .select()
    .from(pipelineRuns)
    .where(isNull(pipelineRuns.workspaceId));
  for (const row of unboundRuns) {
    const workspaceId =
      (row.scheduleId ? scheduleWorkspaceById.get(row.scheduleId) : null) ??
      (row.postId ? postWorkspaceById.get(row.postId) : null) ??
      defaultWorkspaceId;
    await db
      .update(pipelineRuns)
      .set({ workspaceId })
      .where(eq(pipelineRuns.id, row.id));
  }

  const runRows = await db
    .select({ id: pipelineRuns.id, workspaceId: pipelineRuns.workspaceId })
    .from(pipelineRuns);
  const runWorkspaceById = new Map(runRows.map((row) => [row.id, row.workspaceId]));

  const unboundReplyCandidates = await db
    .select()
    .from(replyCandidates)
    .where(isNull(replyCandidates.workspaceId));
  for (const row of unboundReplyCandidates) {
    const workspaceId =
      (row.platformId ? platformWorkspaceById.get(row.platformId) : null) ??
      defaultWorkspaceId;
    await db
      .update(replyCandidates)
      .set({ workspaceId })
      .where(eq(replyCandidates.id, row.id));
  }

  const unboundReplyEvents = await db
    .select()
    .from(replyEvents)
    .where(isNull(replyEvents.workspaceId));
  for (const row of unboundReplyEvents) {
    const workspaceId =
      (row.platformId ? platformWorkspaceById.get(row.platformId) : null) ??
      (row.scheduleId ? scheduleWorkspaceById.get(row.scheduleId) : null) ??
      (row.runId ? runWorkspaceById.get(row.runId) : null) ??
      defaultWorkspaceId;
    await db
      .update(replyEvents)
      .set({ workspaceId })
      .where(eq(replyEvents.id, row.id));
  }
}

async function ensureDefaultTenantForEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date();

  const selectUser = () =>
    db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .get();

  let user = await selectUser();

  if (!user) {
    await db
      .insert(users)
      .values({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        fullName: humanNameFromEmail(normalizedEmail),
        authProvider: "magic_link",
        createdAt: now,
        updatedAt: now,
        lastSeenAt: now,
      })
      .onConflictDoNothing();

    user = await selectUser();
  }

  if (!user) {
    throw new Error("Failed to initialize user.");
  }

  const joinedOrg = await joinedOrganizationForUser(user.id);

  if (joinedOrg) {
    return {
      user,
      organization: joinedOrg.organization,
      orgMembership: joinedOrg.orgMembership,
    };
  }

  return initializeDefaultTenantForUser(user, now);
}

function initializeDefaultTenantForUser(user: UserRow, now: Date) {
  const existing = tenantCreationLocks.get(user.id);
  if (existing) {
    return existing;
  }

  const pending = createDefaultTenantForUser(user, now).finally(() => {
    tenantCreationLocks.delete(user.id);
  });
  tenantCreationLocks.set(user.id, pending);

  return pending;
}

async function createDefaultTenantForUser(
  user: UserRow,
  now: Date
): Promise<TenantInitialization> {
  const joinedOrg = await joinedOrganizationForUser(user.id);
  if (joinedOrg) {
    return {
      user,
      organization: joinedOrg.organization,
      orgMembership: joinedOrg.orgMembership,
    };
  }

  const orgName = "SMM Agent";
  const organizationId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  let orgSlug: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await nextOrganizationSlug(orgName);

    try {
      await db.insert(organizations).values({
        id: organizationId,
        name: orgName,
        slug: candidate,
        defaultTimezone: "America/New_York",
        createdAt: now,
        updatedAt: now,
      });
      orgSlug = candidate;
      break;
    } catch (error) {
      if (!isSqliteUniqueConstraintError(error, "organizations.slug")) {
        throw error;
      }

      const racedOrg = await joinedOrganizationForUser(user.id);
      if (racedOrg) {
        return {
          user,
          organization: racedOrg.organization,
          orgMembership: racedOrg.orgMembership,
        };
      }
    }
  }

  if (!orgSlug) {
    throw new Error("Failed to initialize organization.");
  }

  await db.insert(orgMemberships).values({
    id: crypto.randomUUID(),
    userId: user.id,
    organizationId,
    orgRole: "owner",
    invitedAt: now,
    acceptedAt: now,
  });

  await db.insert(workspaces).values({
    id: workspaceId,
    organizationId,
    name: "Primary Workspace",
    slug: "primary-workspace",
    description: "Default workspace for legacy SMM Agent data.",
    timezone: "America/New_York",
    primaryColor: "#d86d36",
    secondaryColor: "#0c5f6b",
    approvalWorkflowMode: "none",
    defaultHashtags: [],
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(workspaceMemberships).values({
    id: crypto.randomUUID(),
    userId: user.id,
    workspaceId,
    workspaceRole: "owner",
    addedAt: now,
  });

  await db
    .update(users)
    .set({
      lastWorkspaceId: workspaceId,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await ensureLegacyPlatformsBound(workspaceId);

  // Enqueue welcome drip sequence for new users
  try {
    const { enqueueDrip } = await import("@/lib/marketing/drip");
    enqueueDrip(user.id, workspaceId);
  } catch (e) {
    console.warn("[tenancy] failed to enqueue drip:", e);
  }

  return {
    user: {
      ...user,
      lastWorkspaceId: workspaceId,
      lastSeenAt: now,
      updatedAt: now,
    },
    organization: (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, organizationId))
        .get()
    )!,
    orgMembership: (
      await db
        .select()
        .from(orgMemberships)
        .where(eq(orgMemberships.userId, user.id))
        .get()
    )!,
  };
}

export async function getTenantContext(): Promise<TenantContext | null> {
  const session = await getSession();
  if (!session?.email) {
    return null;
  }

  const { user, organization, orgMembership } = await ensureDefaultTenantForEmail(
    session.email
  );

  const memberships = await db
    .select({
      workspace: workspaces,
      membership: workspaceMemberships,
    })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
    .where(eq(workspaceMemberships.userId, user.id));

  if (!memberships.length) {
    throw new Error("User has no workspace memberships.");
  }

  const cookieStore = await cookies();
  const preferredWorkspaceId = cookieStore.get(WORKSPACE_COOKIE)?.value;
  const activeWorkspaceEntry =
    memberships.find(
      (entry) =>
        entry.workspace.id === preferredWorkspaceId && !entry.workspace.isArchived
    ) ??
    memberships.find(
      (entry) =>
        entry.workspace.id === user.lastWorkspaceId && !entry.workspace.isArchived
    ) ??
    memberships.find((entry) => !entry.workspace.isArchived) ??
    memberships[0];


  const now = new Date();
  if (
    activeWorkspaceEntry &&
    (user.lastWorkspaceId !== activeWorkspaceEntry.workspace.id ||
      !user.lastSeenAt ||
      now.getTime() - user.lastSeenAt.getTime() > 5 * 60 * 1000)
  ) {
    await db
      .update(users)
      .set({
        lastWorkspaceId: activeWorkspaceEntry.workspace.id,
        lastSeenAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
  }

  if (memberships.length === 1) {
    await ensureLegacyWorkspaceBindings(activeWorkspaceEntry.workspace.id);
  }

  return {
    session,
    user: {
      ...user,
      lastWorkspaceId: activeWorkspaceEntry.workspace.id,
      lastSeenAt: now,
      updatedAt: now,
    },
    organization,
    orgMembership,
    currentWorkspace: activeWorkspaceEntry.workspace,
    currentWorkspaceMembership: activeWorkspaceEntry.membership,
    accessibleWorkspaces: memberships
      .sort((left, right) => {
        if (left.workspace.isArchived !== right.workspace.isArchived) {
          return left.workspace.isArchived ? 1 : -1;
        }
        return left.workspace.name.localeCompare(right.workspace.name);
      })
      .map((entry) => ({
        workspace: entry.workspace,
        membership: entry.membership,
      })),
  };
}

export async function requireTenantContext() {
  const context = await getTenantContext();
  if (!context) {
    throw new Error("UNAUTHORIZED");
  }
  return context;
}

export async function switchCurrentWorkspace(workspaceId: string) {
  const context = await requireTenantContext();
  const target = context.accessibleWorkspaces.find(
    (entry) => entry.workspace.id === workspaceId && !entry.workspace.isArchived
  );

  if (!target) {
    throw new Error("Workspace not found.");
  }

  const now = new Date();
  await db
    .update(users)
    .set({
      lastWorkspaceId: target.workspace.id,
      lastSeenAt: now,
      updatedAt: now,
    })
    .where(eq(users.id, context.user.id));

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, target.workspace.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return target.workspace;
}

export async function getOrgMembersData() {
  const context = await requireTenantContext();
  const memberRows = await db
    .select({
      membership: orgMemberships,
      user: users,
    })
    .from(orgMemberships)
    .innerJoin(users, eq(orgMemberships.userId, users.id))
    .where(eq(orgMemberships.organizationId, context.organization.id));

  const workspaceRows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.organizationId, context.organization.id));

  const workspaceIds = workspaceRows.map((workspace) => workspace.id);

  const workspaceMemberRows = workspaceIds.length
    ? await db
        .select({
          membership: workspaceMemberships,
          workspace: workspaces,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaceMemberships.workspaceId, workspaces.id))
        .where(inArray(workspaceMemberships.workspaceId, workspaceIds))
    : [];

  const invitationRows = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.organizationId, context.organization.id),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, new Date())
      )
    );

  return {
    context,
    members: memberRows,
    workspaces: workspaceRows.sort((left, right) =>
      left.name.localeCompare(right.name)
    ),
    workspaceMemberships: workspaceMemberRows,
    invitations: invitationRows.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    ),
  };
}

export async function createWorkspaceForCurrentOrg(name: string) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Workspace name is required.");
  }

  const now = new Date();
  const workspaceId = crypto.randomUUID();
  const slug = await nextWorkspaceSlug(context.organization.id, trimmedName);

  await db.insert(workspaces).values({
    id: workspaceId,
    organizationId: context.organization.id,
    name: trimmedName,
    slug,
    timezone: context.organization.defaultTimezone,
    defaultHashtags: [],
    approvalWorkflowMode: "none",
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(workspaceMemberships).values({
    id: crypto.randomUUID(),
    userId: context.user.id,
    workspaceId,
    workspaceRole: "owner",
    addedAt: now,
  });

  await switchCurrentWorkspace(workspaceId);
  await recordAuditEvent(context, {
    action: "workspace.create",
    targetType: "workspace",
    targetId: workspaceId,
    workspaceId,
    metadata: { name: trimmedName },
  });

  return workspaceId;
}

export async function updateOrganizationGeneral(input: {
  name: string;
  defaultTimezone: string;
}) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const name = input.name.trim();
  const timezone = input.defaultTimezone.trim() || "UTC";
  if (!name) {
    throw new Error("Organization name is required.");
  }

  await db
    .update(organizations)
    .set({
      name,
      defaultTimezone: timezone,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, context.organization.id));
  await recordAuditEvent(context, {
    action: "organization.update",
    targetType: "organization",
    targetId: context.organization.id,
    workspaceId: null,
    metadata: { name, defaultTimezone: timezone },
  });
}

export async function scheduleOrganizationDeletion() {
  const context = await requireTenantContext();
  requireOrgOwner(context);

  const now = new Date();
  const scheduledFor = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  await db
    .update(organizations)
    .set({
      deletionRequestedAt: now,
      deletionScheduledFor: scheduledFor,
      updatedAt: now,
    })
    .where(eq(organizations.id, context.organization.id));
  await recordAuditEvent(context, {
    action: "organization.deletion_scheduled",
    targetType: "organization",
    targetId: context.organization.id,
    workspaceId: null,
    metadata: { scheduledFor: scheduledFor.toISOString() },
  });
}

export async function cancelOrganizationDeletion() {
  const context = await requireTenantContext();
  requireOrgOwner(context);

  await db
    .update(organizations)
    .set({
      deletionRequestedAt: null,
      deletionScheduledFor: null,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, context.organization.id));
  await recordAuditEvent(context, {
    action: "organization.deletion_cancelled",
    targetType: "organization",
    targetId: context.organization.id,
    workspaceId: null,
  });
}

export async function updateCurrentWorkspaceGeneral(input: {
  name: string;
  description: string;
  timezone: string;
  primaryColor: string;
  secondaryColor: string;
  defaultHashtags: string[];
  defaultFirstComment: string;
  approvalWorkflowMode?: ApprovalWorkflowMode;
}) {
  const context = await requireTenantContext();
  const workspace = context.currentWorkspace;
  requireWorkspaceManager(context, workspace.id);
  const name = input.name.trim();
  if (!name) {
    throw new Error("Workspace name is required.");
  }

  await db
    .update(workspaces)
    .set({
      name,
      description: input.description.trim(),
      timezone: input.timezone.trim(),
      primaryColor: input.primaryColor.trim(),
      secondaryColor: input.secondaryColor.trim(),
      defaultHashtags: input.defaultHashtags,
      defaultFirstComment: input.defaultFirstComment.trim(),
      approvalWorkflowMode:
        input.approvalWorkflowMode ?? workspace.approvalWorkflowMode,
      updatedAt: new Date(),
    })
    .where(eq(workspaces.id, workspace.id));
  await recordAuditEvent(context, {
    action: "workspace.update",
    targetType: "workspace",
    targetId: workspace.id,
    workspaceId: workspace.id,
    metadata: { name, approvalWorkflowMode: input.approvalWorkflowMode },
  });
}

export async function archiveWorkspace(workspaceId: string) {
  const context = await requireTenantContext();
  requireWorkspaceManager(context, workspaceId);
  const activeWorkspaces = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, context.organization.id),
        eq(workspaces.isArchived, false)
      )
    );

  if (activeWorkspaces.length <= 1) {
    throw new Error("Cannot archive the last workspace.");
  }

  await db
    .update(workspaces)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.organizationId, context.organization.id)
      )
    );
  await recordAuditEvent(context, {
    action: "workspace.archive",
    targetType: "workspace",
    targetId: workspaceId,
    workspaceId,
  });

  if (context.currentWorkspace.id === workspaceId) {
    const fallback = activeWorkspaces.find((workspace) => workspace.id !== workspaceId);
    if (fallback) {
      await switchCurrentWorkspace(fallback.id);
    }
  }
}

export async function restoreWorkspace(workspaceId: string) {
  const context = await requireTenantContext();
  requireWorkspaceManager(context, workspaceId);
  await db
    .update(workspaces)
    .set({ isArchived: false, updatedAt: new Date() })
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.organizationId, context.organization.id)
      )
    );
  await recordAuditEvent(context, {
    action: "workspace.restore",
    targetType: "workspace",
    targetId: workspaceId,
    workspaceId,
  });
}

export async function deleteWorkspace(workspaceId: string) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const activeCount = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.organizationId, context.organization.id),
        eq(workspaces.isArchived, false)
      )
    );

  const target = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.organizationId, context.organization.id)
      )
    )
    .get();

  if (!target) {
    throw new Error("Workspace not found.");
  }

  if (!target.isArchived && activeCount.length <= 1) {
    throw new Error("Cannot delete the last active workspace.");
  }

  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await recordAuditEvent(context, {
    action: "workspace.delete",
    targetType: "workspace",
    targetId: workspaceId,
    workspaceId: null,
    metadata: { name: target.name },
  });

  if (context.currentWorkspace.id === workspaceId) {
    const fallback = activeCount.find((workspace) => workspace.id !== workspaceId);
    if (fallback) {
      await switchCurrentWorkspace(fallback.id);
    }
  }
}

export async function createInvitation(input: {
  email: string;
  orgRole: OrgRole;
  workspaceAssignments: Array<{ workspaceId: string; role: WorkspaceRole }>;
}) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  if (input.orgRole !== "admin" && input.orgRole !== "member") {
    throw new Error("Invites can only grant Admin or User access.");
  }
  if (
    context.orgMembership.orgRole !== "owner" &&
    input.workspaceAssignments.some((assignment) => assignment.role === "owner")
  ) {
    throw new Error("Only an owner can grant workspace owner access.");
  }
  const email = normalizeEmail(input.email);
  if (!email) {
    throw new Error("Invite email is required.");
  }

  const member = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(orgMemberships, eq(users.id, orgMemberships.userId))
    .where(
      and(
        eq(users.email, email),
        eq(orgMemberships.organizationId, context.organization.id)
      )
    )
    .get();

  if (member) {
    throw new Error("That person is already in the organization.");
  }

  const pending = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.organizationId, context.organization.id),
        eq(workspaceInvitations.email, email),
        isNull(workspaceInvitations.acceptedAt),
        gt(workspaceInvitations.expiresAt, new Date())
      )
    )
    .get();

  if (pending) {
    throw new Error("An invite is already pending for that email.");
  }

  const orgWorkspaceRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, context.organization.id));
  const validWorkspaceIds = new Set(orgWorkspaceRows.map((row) => row.id));
  for (const assignment of input.workspaceAssignments) {
    if (!validWorkspaceIds.has(assignment.workspaceId)) {
      throw new Error("Invite includes a workspace outside this organization.");
    }
  }

  const invitationId = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(workspaceInvitations).values({
    id: invitationId,
    organizationId: context.organization.id,
    email,
    orgRole: input.orgRole,
    workspaceAssignments: input.workspaceAssignments,
    invitedByUserId: context.user.id,
    token,
    expiresAt,
    createdAt: now,
  });
  await recordAuditEvent(context, {
    action: "invitation.create",
    targetType: "workspace_invitation",
    targetId: invitationId,
    workspaceId: input.workspaceAssignments[0]?.workspaceId ?? null,
    metadata: {
      email,
      orgRole: input.orgRole,
      workspaceAssignments: input.workspaceAssignments,
    },
  });

  return {
    id: invitationId,
    token,
    email,
    url: `${getAppUrlFromEnv()}/invite/${token}`,
  };
}

export async function resendInvitation(invitationId: string) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const invitation = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.organizationId, context.organization.id)
      )
    )
    .get();

  if (!invitation) {
    throw new Error("Invitation not found.");
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  await db
    .update(workspaceInvitations)
    .set({ token, expiresAt })
    .where(eq(workspaceInvitations.id, invitation.id));
  await recordAuditEvent(context, {
    action: "invitation.resend",
    targetType: "workspace_invitation",
    targetId: invitation.id,
    workspaceId: invitation.workspaceAssignments?.[0]?.workspaceId ?? null,
    metadata: { email: invitation.email },
  });

  return {
    ...invitation,
    token,
    expiresAt,
    url: `${getAppUrlFromEnv()}/invite/${token}`,
  };
}

export async function revokeInvitation(invitationId: string) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const invitation = await db
    .select()
    .from(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.organizationId, context.organization.id)
      )
    )
    .get();

  await db
    .delete(workspaceInvitations)
    .where(
      and(
        eq(workspaceInvitations.id, invitationId),
        eq(workspaceInvitations.organizationId, context.organization.id)
      )
    );
  if (invitation) {
    await recordAuditEvent(context, {
      action: "invitation.revoke",
      targetType: "workspace_invitation",
      targetId: invitation.id,
      workspaceId: invitation.workspaceAssignments?.[0]?.workspaceId ?? null,
      metadata: { email: invitation.email },
    });
  }
}

export async function acceptInvitationByToken(token: string) {
  const context = await requireTenantContext();
  const invitation = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.token, token))
    .get();

  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    throw new Error("Invitation is invalid or expired.");
  }

  if (normalizeEmail(invitation.email) !== normalizeEmail(context.user.email)) {
    throw new Error("This invite belongs to a different email.");
  }

  const now = new Date();
  const existingOrgMembership = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.organizationId, invitation.organizationId),
        eq(orgMemberships.userId, context.user.id)
      )
    )
    .get();

  if (!existingOrgMembership) {
    await db.insert(orgMemberships).values({
      id: crypto.randomUUID(),
      userId: context.user.id,
      organizationId: invitation.organizationId,
      orgRole: invitation.orgRole,
      invitedAt: invitation.createdAt,
      acceptedAt: now,
    });
  }

  for (const assignment of invitation.workspaceAssignments ?? []) {
    const existingWorkspaceMembership = await db
      .select()
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, context.user.id),
          eq(workspaceMemberships.workspaceId, assignment.workspaceId)
        )
      )
      .get();

    if (existingWorkspaceMembership) {
      await db
        .update(workspaceMemberships)
        .set({ workspaceRole: assignment.role })
        .where(eq(workspaceMemberships.id, existingWorkspaceMembership.id));
    } else {
      await db.insert(workspaceMemberships).values({
        id: crypto.randomUUID(),
        userId: context.user.id,
        workspaceId: assignment.workspaceId,
        workspaceRole: assignment.role,
        addedAt: now,
      });
    }
  }

  await db
    .update(workspaceInvitations)
    .set({ acceptedAt: now })
    .where(eq(workspaceInvitations.id, invitation.id));
  await recordAuditEvent(context, {
    action: "invitation.accept",
    targetType: "workspace_invitation",
    targetId: invitation.id,
    workspaceId: invitation.workspaceAssignments?.[0]?.workspaceId ?? null,
    metadata: { email: invitation.email },
  });

  const firstWorkspaceId = invitation.workspaceAssignments?.[0]?.workspaceId;
  if (firstWorkspaceId) {
    await switchCurrentWorkspace(firstWorkspaceId);
  }

  return invitation;
}

export async function updateMemberOrgRole(membershipId: string, orgRole: OrgRole) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  if (orgRole !== "admin" && orgRole !== "member") {
    throw new Error("Members can only be set to Admin or User.");
  }
  const membership = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.id, membershipId),
        eq(orgMemberships.organizationId, context.organization.id)
      )
    )
    .get();

  if (!membership) {
    throw new Error("Member not found.");
  }

  if (membership.orgRole === "owner" && context.orgMembership.orgRole !== "owner") {
    throw new Error("Only an owner can change owner access.");
  }

  if (membership.orgRole === "owner") {
    const owners = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.organizationId, context.organization.id),
          eq(orgMemberships.orgRole, "owner")
        )
      );

    if (owners.length <= 1) {
      throw new Error("Cannot demote the last owner.");
    }
  }

  await db
    .update(orgMemberships)
    .set({ orgRole })
    .where(eq(orgMemberships.id, membership.id));
  await recordAuditEvent(context, {
    action: "member.org_role_update",
    targetType: "org_membership",
    targetId: membership.id,
    workspaceId: null,
    metadata: {
      userId: membership.userId,
      previousOrgRole: membership.orgRole,
      orgRole,
    },
  });
}

export async function updateMemberWorkspaceAssignments(
  userId: string,
  assignments: Array<{ workspaceId: string; role: WorkspaceRole }>
) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const orgWorkspaceRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, context.organization.id));
  const validWorkspaceIds = new Set(orgWorkspaceRows.map((row) => row.id));

  for (const assignment of assignments) {
    if (!validWorkspaceIds.has(assignment.workspaceId)) {
      throw new Error("Invalid workspace assignment.");
    }
  }

  const current = await db
    .select()
    .from(workspaceMemberships)
    .where(
      inArray(
        workspaceMemberships.workspaceId,
        orgWorkspaceRows.map((row) => row.id)
      )
    );

  const currentForUser = current.filter((membership) => membership.userId === userId);
  if (
    context.orgMembership.orgRole !== "owner" &&
    (currentForUser.some((membership) => membership.workspaceRole === "owner") ||
      assignments.some((assignment) => assignment.role === "owner"))
  ) {
    throw new Error("Only an owner can change workspace owner access.");
  }
  const currentByWorkspaceId = new Map(
    currentForUser.map((membership) => [membership.workspaceId, membership])
  );
  const desiredWorkspaceIds = new Set(assignments.map((assignment) => assignment.workspaceId));

  for (const membership of currentForUser) {
    if (!desiredWorkspaceIds.has(membership.workspaceId)) {
      await db
        .delete(workspaceMemberships)
        .where(eq(workspaceMemberships.id, membership.id));
    }
  }

  for (const assignment of assignments) {
    const existing = currentByWorkspaceId.get(assignment.workspaceId);
    if (existing) {
      if (existing.workspaceRole !== assignment.role) {
        await db
          .update(workspaceMemberships)
          .set({ workspaceRole: assignment.role })
          .where(eq(workspaceMemberships.id, existing.id));
      }
      continue;
    }

    await db.insert(workspaceMemberships).values({
      id: crypto.randomUUID(),
      userId,
      workspaceId: assignment.workspaceId,
      workspaceRole: assignment.role,
      addedAt: new Date(),
    });
  }
  await recordAuditEvent(context, {
    action: "member.workspace_assignments_update",
    targetType: "user",
    targetId: userId,
    workspaceId: assignments[0]?.workspaceId ?? null,
    metadata: { assignments },
  });
}

export async function removeMemberFromOrganization(membershipId: string) {
  const context = await requireTenantContext();
  requireOrgAdmin(context);
  const membership = await db
    .select()
    .from(orgMemberships)
    .where(
      and(
        eq(orgMemberships.id, membershipId),
        eq(orgMemberships.organizationId, context.organization.id)
      )
    )
    .get();

  if (!membership) {
    throw new Error("Member not found.");
  }

  if (membership.userId === context.user.id) {
    throw new Error("You cannot remove yourself.");
  }

  if (membership.orgRole === "owner") {
    if (context.orgMembership.orgRole !== "owner") {
      throw new Error("Only an owner can remove another owner.");
    }

    const owners = await db
      .select()
      .from(orgMemberships)
      .where(
        and(
          eq(orgMemberships.organizationId, context.organization.id),
          eq(orgMemberships.orgRole, "owner")
        )
      );

    if (owners.length <= 1) {
      throw new Error("Cannot remove the last owner.");
    }
  }

  const orgWorkspaceRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.organizationId, context.organization.id));
  const workspaceIds = orgWorkspaceRows.map((row) => row.id);
  if (workspaceIds.length > 0) {
    await db
      .delete(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.userId, membership.userId),
          inArray(workspaceMemberships.workspaceId, workspaceIds)
        )
      );
  }

  await db.delete(orgMemberships).where(eq(orgMemberships.id, membership.id));
  await recordAuditEvent(context, {
    action: "member.remove",
    targetType: "org_membership",
    targetId: membership.id,
    workspaceId: null,
    metadata: { userId: membership.userId, orgRole: membership.orgRole },
  });
}

export function formatWorkspaceAssignments(
  assignments: WorkspaceInvitationRow["workspaceAssignments"] | undefined,
  workspaceRows: WorkspaceRow[]
) {
  const workspaceNameById = new Map(
    workspaceRows.map((workspace) => [workspace.id, workspace.name])
  );

  return (assignments ?? []).map((assignment) => ({
    ...assignment,
    workspaceName:
      workspaceNameById.get(assignment.workspaceId) ?? "Unknown workspace",
  }));
}

export function getWorkspaceSummary(workspace: WorkspaceRow, organization: OrganizationRow) {
  return {
    ...workspace,
    defaultHashtags: workspace.defaultHashtags ?? [],
    effectiveTimezone: effectiveWorkspaceTimezone(workspace, organization),
  };
}
