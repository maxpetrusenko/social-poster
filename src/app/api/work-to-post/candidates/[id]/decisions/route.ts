import { NextResponse } from "next/server";
import { requireConfiguredWorkToPostApprover } from "@/lib/work-to-post/api-auth";
import { recordDecision } from "@/lib/work-to-post/lifecycle";
import { createSqliteWorkToPostRepository } from "@/lib/work-to-post/sqlite-repository";
import type { DecisionCommand } from "@/lib/work-to-post/contracts";
import { createLearningProposalFromDenial, WorkToPostConflictError, WorkToPostNotFoundError } from "@/lib/work-to-post/learning-repository";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const tenant = await requireConfiguredWorkToPostApprover();
  if (tenant instanceof NextResponse) return tenant;
  const command = await parseCommand(request);
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  const expectedRevision = Number(request.headers.get("if-match-revision"));
  if (!command || !idempotencyKey || !Number.isInteger(expectedRevision) || expectedRevision < 1) return NextResponse.json({ error: "A valid decision, Idempotency-Key, and If-Match-Revision are required." }, { status: 400 });
  const { id } = await params;
  try {
    if (command.type === "deny") {
      const result = await createLearningProposalFromDenial({ workspaceId: tenant.currentWorkspace.id, candidateId: id, expectedRevision, idempotencyKey, reasonCodes: command.reasonCodes });
      return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
    }
    return NextResponse.json(await recordDecision(createSqliteWorkToPostRepository(), tenant.currentWorkspace.id, id, command, { idempotencyKey, expectedRevision }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Decision rejected.";
    return NextResponse.json({ error: message }, { status: error instanceof WorkToPostNotFoundError || message.includes("not found") ? 404 : error instanceof WorkToPostConflictError ? 409 : 409 });
  }
}

async function parseCommand(request: Request): Promise<DecisionCommand | null> {
  try {
    const value = await request.json() as Record<string, unknown>;
    if (value.type === "approve_now") return { type: "approve_now" };
    if (value.type === "approve_schedule" && typeof value.scheduledAt === "string" && !Number.isNaN(Date.parse(value.scheduledAt))) return { type: "approve_schedule", scheduledAt: value.scheduledAt };
    if (value.type === "deny" && Array.isArray(value.reasonCodes) && value.reasonCodes.every((reason) => typeof reason === "string")) return { type: "deny", reasonCodes: value.reasonCodes as string[] };
    return null;
  } catch { return null; }
}
