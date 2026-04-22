import { NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { importEnvModelProviders } from "@/lib/model-providers";

export async function POST() {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const result = await importEnvModelProviders({
    workspaceId: tenant.currentWorkspace.id,
    userId: tenant.user.id,
  });

  return NextResponse.json(result);
}
