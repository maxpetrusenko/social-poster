import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import { createCampaignEvent, getCampaignDetail } from "@/lib/campaigns/records";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const { id } = await params;
  const campaign = await getCampaignDetail(tenant.currentWorkspace.id, id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  return NextResponse.json({ campaign });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const { id } = await params;
    const existing = await getCampaignDetail(tenant.currentWorkspace.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const body = await request.json();
    const updates: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.brief === "string") updates.brief = body.brief;
    if (typeof body.objective === "string") updates.objective = body.objective;
    if (typeof body.status === "string") updates.status = body.status;
    if (typeof body.selectedCreativeId === "string") updates.selectedCreativeId = body.selectedCreativeId;
    if (Array.isArray(body.selectedPlatforms)) {
      updates.selectedPlatforms = Array.from(
        new Set(body.selectedPlatforms.filter((value: unknown): value is string => typeof value === "string"))
      );
    }

    await db.update(campaigns).set(updates).where(eq(campaigns.id, id));
    await createCampaignEvent({
      campaignId: id,
      eventType: "campaign.updated",
      payload: updates as Record<string, unknown>,
      actorUserId: tenant.user.id,
    });

    await recordTenantAuditEvent(tenant, {
      action: "campaign.update",
      targetType: "campaign",
      targetId: id,
      metadata: { endpoint: "PATCH /api/campaigns/[id]" },
    });

    const campaign = await getCampaignDetail(tenant.currentWorkspace.id, id);
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("PATCH /api/campaigns/[id] error:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}
