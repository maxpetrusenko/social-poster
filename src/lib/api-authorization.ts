import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  canEditCurrentWorkspaceContent,
  canManageCurrentWorkspace,
  canManageOrganization,
  canPublishCurrentWorkspaceContent,
  requireTenantContext,
} from "@/lib/tenancy";

type ApiTenantCheck = (context: Awaited<ReturnType<typeof requireTenantContext>>) => boolean;

async function requireApiTenant(check: ApiTenantCheck, message: string) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  const context = await requireTenantContext();
  if (!check(context)) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  return context;
}

export async function requireApiOrgAdmin() {
  return requireApiTenant(
    canManageOrganization,
    "Organization admin access is required."
  );
}

export async function requireApiWorkspaceManager() {
  return requireApiTenant(
    canManageCurrentWorkspace,
    "Workspace manager access is required."
  );
}

export async function requireApiWorkspaceEditor() {
  return requireApiTenant(
    canEditCurrentWorkspaceContent,
    "Workspace editor access is required."
  );
}

export async function requireApiWorkspacePublisher() {
  return requireApiTenant(
    canPublishCurrentWorkspaceContent,
    "Workspace publisher access is required."
  );
}
