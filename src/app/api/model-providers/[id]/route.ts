import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { revokeModelProvider } from "@/lib/model-providers";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  await revokeModelProvider(tenant.currentWorkspace.id, id);
  return NextResponse.json({ ok: true });
}
