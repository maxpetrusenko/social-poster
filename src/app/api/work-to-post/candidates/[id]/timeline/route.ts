import { NextResponse } from "next/server";
import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { getCandidateTimeline } from "@/lib/work-to-post/sqlite-repository";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const { id } = await params;
  const result = await getCandidateTimeline(tenant.currentWorkspace.id, id);
  return result ? NextResponse.json(result) : NextResponse.json({ error: "Candidate not found." }, { status: 404 });
}
