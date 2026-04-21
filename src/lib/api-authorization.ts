import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  canEditCurrentWorkspaceContent,
  canManageCurrentWorkspace,
  canManageOrganization,
  canPublishCurrentWorkspaceContent,
  requireTenantContext,
} from "@/lib/tenancy";
import { validateApiKey, buildTenantFromApiKey } from "@/lib/api-key-auth";

type TenantContext = Awaited<ReturnType<typeof requireTenantContext>>;
type ApiTenantCheck = (context: TenantContext) => boolean;

async function requireApiTenant(check: ApiTenantCheck, message: string) {
  // Try session auth first
  const session = await requireApiSession();
  if (!(session instanceof NextResponse)) {
    const context = await requireTenantContext();
    if (!check(context)) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return context;
  }

  // Fall back to API key auth
  const keyCtx = await validateApiKey();
  if (!keyCtx) {
    return NextResponse.json({ error: "Authentication required. Provide a session cookie or API key via Authorization: Bearer sk_..." }, { status: 401 });
  }

  const tenant = await buildTenantFromApiKey(keyCtx);
  if (!tenant) {
    return NextResponse.json({ error: "API key workspace or user not found." }, { status: 403 });
  }

  // For API key auth, check permission level
  if (check === canPublishCurrentWorkspaceContent || check === canEditCurrentWorkspaceContent) {
    if (keyCtx.permission !== "read_write") {
      return NextResponse.json({ error: "This API key only has read permission. A read_write key is required." }, { status: 403 });
    }
  }

  if (!check(tenant as TenantContext)) {
    return NextResponse.json({ error: message }, { status: 403 });
  }

  return tenant as TenantContext;
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
