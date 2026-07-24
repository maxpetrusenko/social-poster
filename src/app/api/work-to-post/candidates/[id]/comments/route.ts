import { NextResponse } from "next/server";

import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { appendCandidateComment, WorkToPostConflictError, WorkToPostNotFoundError } from "@/lib/work-to-post/learning-repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const body = await readBody(request);
  const options = mutationHeaders(request);
  if (!body || !options || typeof body.body !== "string") return NextResponse.json({ error: "A comment body, Idempotency-Key, and If-Match-Revision are required." }, { status: 400 });
  const { id } = await params;
  try {
    const result = await appendCandidateComment({ workspaceId: tenant.currentWorkspace.id, candidateId: id, body: body.body, ...options });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return mutationError(error);
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

function mutationHeaders(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const expectedRevision = Number(request.headers.get("if-match-revision"));
  return idempotencyKey && Number.isInteger(expectedRevision) && expectedRevision > 0 ? { idempotencyKey, expectedRevision } : null;
}

function mutationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Candidate mutation rejected.";
  return NextResponse.json({ error: message }, { status: error instanceof WorkToPostNotFoundError ? 404 : error instanceof WorkToPostConflictError ? 409 : 400 });
}
