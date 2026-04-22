import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { requireApiWorkspaceEditor } from "@/lib/api-authorization";
import { recordTenantAuditEvent } from "@/lib/audit";
import {
  assertProfileInWorkspace,
  createCampaignEvent,
  getCampaignDetail,
  listCampaignDetails,
} from "@/lib/campaigns/records";

export async function GET(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  const profileId = request.nextUrl.searchParams.get("profileId");
  const rows = await listCampaignDetails(tenant.currentWorkspace.id, profileId);
  return NextResponse.json({ campaigns: rows });
}

export async function POST(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json();
    const profileId = typeof body.profileId === "string" ? body.profileId.trim() : "";
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New campaign";
    const brief = typeof body.brief === "string" ? body.brief.trim() : "";
    const objective = typeof body.objective === "string" ? body.objective.trim() : "";
    const selectedPlatforms: string[] = Array.isArray(body.selectedPlatforms)
      ? Array.from(new Set(body.selectedPlatforms.filter((value: unknown): value is string => typeof value === "string")))
      : [];

    if (!profileId) {
      return NextResponse.json({ error: "profileId is required" }, { status: 400 });
    }

    const profile = await assertProfileInWorkspace(tenant.currentWorkspace.id, profileId);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(campaigns).values({
      id,
      workspaceId: tenant.currentWorkspace.id,
      profileId,
      ownerUserId: tenant.user.id,
      name,
      brief,
      objective,
      status: "draft",
      selectedPlatforms,
      selectedCreativeId: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    });

    await createCampaignEvent({
      campaignId: id,
      eventType: "campaign.created",
      payload: { profileId, profileName: profile.name },
      actorUserId: tenant.user.id,
    });

    await recordTenantAuditEvent(tenant, {
      action: "campaign.create",
      targetType: "campaign",
      targetId: id,
      metadata: { profileId, selectedPlatformCount: selectedPlatforms.length },
    });

    const campaign = await getCampaignDetail(tenant.currentWorkspace.id, id);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("POST /api/campaigns error:", error);
    return NextResponse.json({ error: "Failed to create campaign" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const tenant = await requireApiWorkspaceEditor();
  if (tenant instanceof NextResponse) return tenant;

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await getCampaignDetail(tenant.currentWorkspace.id, id);
    if (!existing) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const updates: Partial<typeof campaigns.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.brief === "string") updates.brief = body.brief;
    if (typeof body.objective === "string") updates.objective = body.objective;
    if (typeof body.status === "string") updates.status = body.status;
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

    const campaign = await getCampaignDetail(tenant.currentWorkspace.id, id);
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("PATCH /api/campaigns error:", error);
    return NextResponse.json({ error: "Failed to update campaign" }, { status: 500 });
  }
}
