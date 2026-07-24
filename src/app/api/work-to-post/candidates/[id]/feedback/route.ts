import { NextResponse } from "next/server";

import { requireConfiguredWorkToPostApprover } from "@/lib/work-to-post/api-auth";
import { createLearningProposalFromDenial, WorkToPostConflictError, WorkToPostNotFoundError } from "@/lib/work-to-post/learning-repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireConfiguredWorkToPostApprover();
  if (tenant instanceof NextResponse) return tenant;
  const body = await readBody(request);
  const options = mutationHeaders(request);
  if (!body || !options || body.type !== "deny" || !Array.isArray(body.reasonCodes) || !body.reasonCodes.every((reason) => typeof reason === "string")) return NextResponse.json({ error: "A denial, reason codes, Idempotency-Key, and If-Match-Revision are required." }, { status: 400 });
  const { id } = await params;
  try {
    const result = await createLearningProposalFromDenial({ workspaceId: tenant.currentWorkspace.id, candidateId: id, reasonCodes: body.reasonCodes, trait: stringOrUndefined(body.trait), direction: stringOrUndefined(body.direction), evidence: stringArrayOrUndefined(body.evidence), confidence: integerOrUndefined(body.confidence), expiresAt: stringOrUndefined(body.expiresAt), ...options });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feedback rejected.";
    return NextResponse.json({ error: message }, { status: error instanceof WorkToPostNotFoundError ? 404 : error instanceof WorkToPostConflictError ? 409 : 400 });
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try { const value = await request.json(); return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; } catch { return null; }
}

function mutationHeaders(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const expectedRevision = Number(request.headers.get("if-match-revision"));
  return idempotencyKey && Number.isInteger(expectedRevision) && expectedRevision > 0 ? { idempotencyKey, expectedRevision } : null;
}

function stringOrUndefined(value: unknown) { return typeof value === "string" ? value : undefined; }
function stringArrayOrUndefined(value: unknown) { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : undefined; }
function integerOrUndefined(value: unknown) { return Number.isInteger(value) ? value as number : undefined; }
