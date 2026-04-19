import { NextResponse } from "next/server";
import { requireApiWorkspacePublisher } from "@/lib/api-authorization";
import { postReplyCandidate } from "@/lib/replies/live";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspacePublisher();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const row = await postReplyCandidate(id, tenant.currentWorkspace.id);
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post reply" },
      { status: 500 }
    );
  }
}
