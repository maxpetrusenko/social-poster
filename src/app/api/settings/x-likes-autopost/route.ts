import { db } from "@/db";
import { pipelineRuns } from "@/db/schema";
import {
  requireApiWorkspaceManager,
  requireApiWorkspaceManagerWrite,
} from "@/lib/api-authorization";
import {
  readXLikedAutopostIntervalMinutes,
  readXLikedAutopostLimit,
} from "@/lib/x-liked-autopost-config";
import {
  isXLikedAutopostPublishMode,
  readXLikedAutopostEnabled,
  X_LIKES_AUTOPOST_SETTING_KEY,
} from "@/lib/x-liked-autopost-setting";
import { clearWorkspaceSetting, setWorkspaceSetting } from "@/lib/workspace-settings";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

async function buildStatus(workspaceId: string) {
  const state = await readXLikedAutopostEnabled(workspaceId);
  const [latestRun] = await db
    .select({
      id: pipelineRuns.id,
      status: pipelineRuns.status,
      startedAt: pipelineRuns.startedAt,
      completedAt: pipelineRuns.completedAt,
      error: pipelineRuns.error,
      postId: pipelineRuns.postId,
    })
    .from(pipelineRuns)
    .where(and(eq(pipelineRuns.workspaceId, workspaceId), sql`${pipelineRuns.steps} like '%x-like:%'`))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(1);

  return {
    enabled: state.enabled,
    source: state.source,
    envDefault: state.envDefault,
    override: state.override,
    // Env safety switch: when MODE is not "publish" the worker never runs, whatever `enabled` says.
    workerActive: state.enabled && isXLikedAutopostPublishMode(),
    mode: process.env.X_LIKES_AUTOPUBLISH_MODE ?? null,
    intervalMinutes: readXLikedAutopostIntervalMinutes(),
    limit: readXLikedAutopostLimit(),
    latestRun: latestRun ?? null,
  };
}

// GET /api/settings/x-likes-autopost — status (enabled, source, last run + result)
export async function GET() {
  const tenant = await requireApiWorkspaceManager();
  if (tenant instanceof NextResponse) return tenant;
  return NextResponse.json(await buildStatus(tenant.currentWorkspace.id));
}

const patchSchema = z.object({ enabled: z.boolean().nullable() }).strict();

// PATCH /api/settings/x-likes-autopost { enabled: true | false | null }
// true/false sets a workspace override of X_LIKES_AUTOPUBLISH_ENABLED; null clears it (back to the env default).
export async function PATCH(request: NextRequest) {
  const tenant = await requireApiWorkspaceManagerWrite();
  if (tenant instanceof NextResponse) return tenant;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: "Validation failed", details: error instanceof z.ZodError ? error.issues : undefined },
      { status: 400 }
    );
  }

  const workspaceId = tenant.currentWorkspace.id;
  if (body.enabled === null) {
    await clearWorkspaceSetting(workspaceId, X_LIKES_AUTOPOST_SETTING_KEY);
  } else {
    await setWorkspaceSetting(workspaceId, X_LIKES_AUTOPOST_SETTING_KEY, String(body.enabled));
  }
  return NextResponse.json(await buildStatus(workspaceId));
}
