import { NextResponse } from "next/server";
import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { listCandidates } from "@/lib/work-to-post/sqlite-repository";

export async function GET() {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  return NextResponse.json({ candidates: await listCandidates(tenant.currentWorkspace.id) });
}
