import { NextResponse } from "next/server";

import { requireConfiguredWorkToPostApprover } from "@/lib/work-to-post/api-auth";
import { transitionLearningProposal, WorkToPostConflictError, WorkToPostNotFoundError } from "@/lib/work-to-post/learning-repository";

export function transition(action: "promote" | "rollback") {
  return async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const tenant = await requireConfiguredWorkToPostApprover();
    if (tenant instanceof NextResponse) return tenant;
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    const expectedVersion = Number(request.headers.get("if-match-version"));
    if (!idempotencyKey || !Number.isInteger(expectedVersion) || expectedVersion < 1) return NextResponse.json({ error: "Idempotency-Key and If-Match-Version are required." }, { status: 400 });
    const { id } = await params;
    try {
      const result = await transitionLearningProposal({ workspaceId: tenant.currentWorkspace.id, proposalId: id, expectedVersion, idempotencyKey, action });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Learning transition rejected.";
      return NextResponse.json({ error: message }, { status: error instanceof WorkToPostNotFoundError ? 404 : error instanceof WorkToPostConflictError ? 409 : 400 });
    }
  };
}
