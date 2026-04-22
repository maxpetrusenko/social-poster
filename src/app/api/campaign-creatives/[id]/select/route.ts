import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignCreatives, campaignEvents, campaigns } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import crypto from "node:crypto";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const row = await db
      .select({ creative: campaignCreatives, campaign: campaigns })
      .from(campaignCreatives)
      .innerJoin(campaigns, eq(campaigns.id, campaignCreatives.campaignId))
      .where(and(eq(campaignCreatives.id, id), eq(campaigns.workspaceId, tenant.currentWorkspace.id)))
      .get();

    if (!row) {
      return NextResponse.json({ error: "Creative not found" }, { status: 404 });
    }

    const now = new Date();
    await db
      .update(campaigns)
      .set({
        selectedCreativeId: id,
        status: row.campaign.status === "draft" ? "review" : row.campaign.status,
        updatedAt: now,
      })
      .where(eq(campaigns.id, row.campaign.id));

    await db.insert(campaignEvents).values({
      id: crypto.randomUUID(),
      campaignId: row.campaign.id,
      creativeId: id,
      eventType: "creative.selected",
      payload: {},
      actorUserId: tenant.user.id,
      createdAt: now,
    });

    await recordTenantAuditEvent(tenant, {
      action: "campaign.creative_select",
      targetType: "campaign_creative",
      targetId: id,
      metadata: { campaignId: row.campaign.id },
    });

    return NextResponse.json({ ok: true, campaignId: row.campaign.id, creativeId: id });
  } catch (error) {
    console.error("POST /api/campaign-creatives/[id]/select error:", error);
    return NextResponse.json({ error: "Failed to select creative" }, { status: 500 });
  }
}
