import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { workspaces } from "@/db/schema";
import { requireApiWorkspaceManager } from "@/lib/api-authorization";
import { runXLikedAutopost } from "@/lib/x-liked-autopost";
import { eq } from "drizzle-orm";

const runSchema = z.object({
  workspaceId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(10).optional(),
  fetchCount: z.number().int().positive().max(50).optional(),
  dryRun: z.boolean().optional(),
});

function getBearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
}

function isCronAuthorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && getBearerToken(request) === secret);
}

async function resolveDefaultWorkspaceId() {
  const first = await db.select({ id: workspaces.id }).from(workspaces);
  return first[0]?.id ?? null;
}

export async function POST(request: NextRequest) {
  const body = runSchema.parse(await request.json().catch(() => ({})));
  let workspaceId = body.workspaceId ?? null;

  if (isCronAuthorized(request)) {
    workspaceId = workspaceId ?? await resolveDefaultWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found." }, { status: 404 });
    }

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, workspaceId),
    });
    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
  } else {
    const tenant = await requireApiWorkspaceManager();
    if (tenant instanceof NextResponse) return tenant;
    workspaceId = tenant.currentWorkspace.id;
  }

  const result = await runXLikedAutopost({
    workspaceId,
    limit: body.limit,
    fetchCount: body.fetchCount,
    dryRun: body.dryRun,
  });

  return NextResponse.json(result);
}

