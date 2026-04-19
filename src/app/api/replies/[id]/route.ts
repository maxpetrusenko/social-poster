import { NextRequest, NextResponse } from "next/server";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { updateReplyCandidateDraft, updateReplyCandidateStatus } from "@/lib/replies/live";
import { z } from "zod";

const bodySchema = z.object({
  status: z.enum(["new", "analyzed", "drafted", "ready", "posted", "skipped"]).optional(),
  selectedDraftIndex: z.number().int().min(0).optional(),
  draftIndex: z.number().int().min(0).optional(),
  draftText: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const body = bodySchema.parse(await request.json());

    if (typeof body.draftIndex === "number" && typeof body.draftText === "string") {
      const row = await updateReplyCandidateDraft(
        id,
        body.draftIndex,
        body.draftText,
        tenant.currentWorkspace.id
      );
      return NextResponse.json({ row });
    }

    if (!body.status) {
      return NextResponse.json({ error: "Missing status update" }, { status: 400 });
    }

    const row = await updateReplyCandidateStatus(
      id,
      body.status,
      body.selectedDraftIndex,
      tenant.currentWorkspace.id
    );
    return NextResponse.json({ row });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation failed", details: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update reply" },
      { status: 500 }
    );
  }
}
