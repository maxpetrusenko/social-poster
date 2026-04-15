import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { postReplyCandidate } from "@/lib/replies/live";
import { getTenantContext } from "@/lib/tenancy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const tenant = await getTenantContext();
    if (!tenant) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
