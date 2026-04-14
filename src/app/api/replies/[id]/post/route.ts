import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { postReplyCandidate } from "@/lib/replies/live";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiSession();
  if (session instanceof NextResponse) return session;

  try {
    const { id } = await params;
    const row = await postReplyCandidate(id);
    return NextResponse.json({ row });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post reply" },
      { status: 500 }
    );
  }
}
