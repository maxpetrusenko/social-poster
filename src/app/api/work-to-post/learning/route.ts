import { NextResponse } from "next/server";

import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { listLearningProposals } from "@/lib/work-to-post/learning-repository";

export async function GET() {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  return NextResponse.json({ proposals: await listLearningProposals(tenant.currentWorkspace.id) });
}
