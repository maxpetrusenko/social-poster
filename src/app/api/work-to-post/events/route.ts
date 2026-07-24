import { NextResponse } from "next/server";
import { parseCompletedWorkEvent } from "@/lib/work-to-post/contracts";
import { ingestCompletedWork } from "@/lib/work-to-post/ingestion";
import { createSqliteWorkToPostRepository } from "@/lib/work-to-post/sqlite-repository";
import { requireWorkToPostEditor } from "@/lib/work-to-post/api-auth";

export async function POST(request: Request) {
  const tenant = await requireWorkToPostEditor();
  if (tenant instanceof NextResponse) return tenant;
  const body = await readJson(request);
  const input = body === null ? null : parseCompletedWorkEvent(body);
  if (!input) return NextResponse.json({ error: "Invalid completed-work event." }, { status: 400 });
  try {
    const result = await ingestCompletedWork(createSqliteWorkToPostRepository(), tenant.currentWorkspace.id, input);
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Completion intake rejected.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

async function readJson(request: Request): Promise<unknown | null> {
  try { return await request.json(); } catch { return null; }
}
