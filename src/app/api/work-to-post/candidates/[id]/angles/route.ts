import { NextResponse } from "next/server";

import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";
import { persistCandidateAngles, WorkToPostConflictError, WorkToPostNotFoundError } from "@/lib/work-to-post/learning-repository";
import { BOARDY_INSPIRED_MECHANISMS } from "@/lib/work-to-post/reference-examples";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const body = await readBody(request);
  const options = mutationHeaders(request);
  if (!body || !options || typeof body.summary !== "string" || !Array.isArray(body.references) || body.references.length !== 3 || !body.references.every(isReference) || new Set(body.references.map((reference) => reference.mechanism)).size !== 3) return NextResponse.json({ error: "A summary, three valid references, Idempotency-Key, and If-Match-Revision are required." }, { status: 400 });
  const { id } = await params;
  try {
    const result = await persistCandidateAngles({ workspaceId: tenant.currentWorkspace.id, candidateId: id, summary: body.summary, references: body.references, ...options });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Angle mutation rejected.";
    return NextResponse.json({ error: message }, { status: error instanceof WorkToPostNotFoundError ? 404 : error instanceof WorkToPostConflictError ? 409 : 400 });
  }
}

type AngleBody = { summary: string; references: Array<{ sourceUrl: string; author: string; capturedAt: string; mechanism: (typeof BOARDY_INSPIRED_MECHANISMS)[number] }> };

async function readBody(request: Request): Promise<AngleBody | null> {
  try {
    const value = await request.json();
    return value && typeof value === "object" && !Array.isArray(value) ? value as AngleBody : null;
  } catch { return null; }
}

function isReference(value: unknown): value is AngleBody["references"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return typeof reference.sourceUrl === "string" && typeof reference.author === "string" && typeof reference.capturedAt === "string" && BOARDY_INSPIRED_MECHANISMS.includes(reference.mechanism as (typeof BOARDY_INSPIRED_MECHANISMS)[number]);
}

function mutationHeaders(request: Request) {
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const expectedRevision = Number(request.headers.get("if-match-revision"));
  return idempotencyKey && Number.isInteger(expectedRevision) && expectedRevision > 0 ? { idempotencyKey, expectedRevision } : null;
}
