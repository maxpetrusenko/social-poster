import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { userUiPreferences } from "@/db/schema";
import { requireTenantContext } from "@/lib/tenancy";
import {
  DEFAULT_AGENT_DOCK_MODE,
  DEFAULT_PRODUCT_MODE,
  parseAgentDockMode,
  parseProductMode,
  type AgentDockMode,
  type ProductMode,
} from "@/lib/user-preferences";

type UiPreferencePatch = Partial<{
  productMode: ProductMode;
  agentDockMode: AgentDockMode;
}>;

export async function POST(req: NextRequest) {
  const ctx = await requireTenantContext();
  const body = (await req.json()) as UiPreferencePatch;

  const patch: UiPreferencePatch = {};
  if ("productMode" in body) {
    patch.productMode = parseProductMode(body.productMode);
  }
  if ("agentDockMode" in body) {
    patch.agentDockMode = parseAgentDockMode(body.agentDockMode);
  }

  if (!patch.productMode && !patch.agentDockMode) {
    return NextResponse.json({ error: "No valid preference provided." }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(userUiPreferences)
    .where(
      and(
        eq(userUiPreferences.userId, ctx.user.id),
        eq(userUiPreferences.workspaceId, ctx.currentWorkspace.id)
      )
    )
    .then((rows) => rows[0] ?? null);

  const now = new Date();
  if (existing) {
    await db
      .update(userUiPreferences)
      .set({ ...patch, updatedAt: now })
      .where(eq(userUiPreferences.id, existing.id));
  } else {
    await db.insert(userUiPreferences).values({
      id: randomUUID(),
      userId: ctx.user.id,
      workspaceId: ctx.currentWorkspace.id,
      productMode: patch.productMode ?? DEFAULT_PRODUCT_MODE,
      agentDockMode: patch.agentDockMode ?? DEFAULT_AGENT_DOCK_MODE,
      createdAt: now,
      updatedAt: now,
    });
  }

  return NextResponse.json({ ok: true, preferences: patch });
}
