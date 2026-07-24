import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { canEditCurrentWorkspaceContent, requireTenantContext } from "@/lib/tenancy";

// Work-to-post intake and dossier mutations intentionally do not accept broad API keys.
// A dedicated, scope-enforced adapter credential does not exist in the current auth model.
export async function requireWorkToPostEditor() {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;
  const tenant = await requireTenantContext();
  if (!canEditCurrentWorkspaceContent(tenant)) {
    return NextResponse.json({ error: "Workspace editor access is required." }, { status: 403 });
  }
  return tenant;
}

export async function requireConfiguredWorkToPostApprover() {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const configured = process.env.WORK_TO_POST_APPROVER_EMAIL?.trim().toLowerCase();
  if (!configured || tenant.user.email.trim().toLowerCase() !== configured) {
    return NextResponse.json({ error: "A configured work-to-post approver is required." }, { status: 403 });
  }
  return tenant;
}
