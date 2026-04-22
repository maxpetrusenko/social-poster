import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { syncModelProvider } from "@/lib/model-providers";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  const result = await syncModelProvider(tenant.currentWorkspace.id, id);
  return NextResponse.json(result);
}
